import {
  IfcAPI,
  IFCELEMENT,
  IFCPROJECT,
  IFCRELDEFINESBYPROPERTIES,
  IFCRELDEFINESBYTYPE,
  IFCPROPERTYSET,
  IFCPROPERTYSINGLEVALUE,
  LogLevel,
} from "web-ifc";
import { z } from "zod";
import type {
  CatalogIndex,
  LibraryModel,
  PreviewGeometry,
  PropertyGroup,
} from "../../shared/contracts.js";
import { buildCreationCatalog, type CreationOccurrence } from "./creation-catalog.js";
import type { CreationIndex } from "../../shared/asset-creation.js";
import { effectiveCategory } from "./catalog.js";
import { buildCatalog, type Candidate } from "./catalog.js";
import { analyzeLibrary, type PropertyObservation } from "./analyze-library.js";
import { AnalysisUnits } from "./analysis-units.js";
import type { LibrarySnapshot } from "../../shared/catalog-library.js";
import {
  normalizeObservation,
  equalNormalized,
} from "../../shared/catalog-normalization.js";

const reference = z.object({ value: z.int().positive() });
const textValue = z.object({ value: z.string() }).nullish();
const scalar = z
  .object({
    value: z.union([z.string(), z.number(), z.boolean()]),
    name: z.string().optional(),
  })
  .nullish();
const entitySchema = z.object({
  expressID: z.int(),
  type: z.number(),
  GlobalId: textValue,
  Name: textValue,
  Description: textValue,
  RelatedObjects: z.array(reference).optional(),
  RelatingType: reference.optional(),
  RelatingPropertyDefinition: z
    .union([reference, z.array(reference)])
    .optional(),
  HasPropertySets: z.array(reference).nullish(),
  HasProperties: z.array(reference).optional(),
  NominalValue: scalar,
  EnumerationValues: z.array(scalar).nullish(),
  ListValues: z.array(scalar).nullish(),
  Unit: reference.nullish(),
  UnitsInContext: reference.nullish(),
  Units: z.array(reference).optional(),
});
type Entity = z.infer<typeof entitySchema>;
export type Progress = (message: string) => void;

// Published declarations claim FlatMesh.delete(), but 0.0.78 returns a plain object.
function release(value: unknown): void {
  if (
    typeof value === "object" &&
    value !== null &&
    "delete" in value &&
    typeof value.delete === "function"
  )
    value.delete();
}

/** Owns exactly one parsed source. All web-ifc's untyped entity data is validated here. */
export class IfcReader {
  private api = new IfcAPI();
  private modelId: number | null = null;
  private candidates = new Set<number>();
  private occurrenceSets = new Map<number, number[]>();
  private occurrenceTypes = new Map<number, number | null>();
  private typeEntities = new Map<number, Entity>();
  private classifications = new Map<number, { present: boolean; value: string | undefined; issues: string[] }>();
  private propertySets = new Map<number, PropertyObservation[]>();
  private analysis: {
    index: CatalogIndex;
    sourceName: string;
    units: AnalysisUnits;
  } | null = null;

  async initialize(wasmPath?: string): Promise<void> {
    if (wasmPath) this.api.SetWasmPath(wasmPath, true);
    await this.api.Init(undefined, true);
    this.api.SetLogLevel(LogLevel.LOG_LEVEL_ERROR);
  }

  private get current(): number {
    if (this.modelId === null)
      throw new Error("Open an IFC model before inspection.");
    return this.modelId;
  }
  private entity(id: number): Entity {
    const raw: unknown = this.api.GetLine(this.current, id, false);
    return entitySchema.parse(raw);
  }
  private ids(type: number, inherited = false): number[] {
    const vector = this.api.GetLineIDsWithType(this.current, type, inherited);
    try {
      return Array.from({ length: vector.size() }, (_, i) => vector.get(i));
    } finally {
      release(vector);
    }
  }

  open(
    bytes: Uint8Array,
    model: Pick<LibraryModel, "id" | "fingerprint"> &
      Partial<Pick<LibraryModel, "name">>,
    progress: Progress = () => {},
    purpose: "browse" | "creation" = "browse",
  ): CatalogIndex {
    this.close();
    if (
      !new TextDecoder()
        .decode(bytes.subarray(0, 1024))
        .includes("ISO-10303-21;")
    )
      throw new Error("Invalid IFC STEP header.");
    try {
      progress("Opening IFC in the browser worker");
      const id = this.api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: false });
      if (id < 0) throw new Error("The IFC parser could not open this model.");
      this.modelId = id;
      if (!this.api.GetModelSchema(id) || this.ids(IFCPROJECT).length === 0)
        throw new Error("IFC has no valid project or supported schema.");
      progress("Reading physical elements and type relationships");
      this.candidates = new Set(this.ids(IFCELEMENT, true));
      for (const relationId of this.ids(IFCRELDEFINESBYTYPE)) {
        const relation = this.entity(relationId);
        if (!relation.RelatingType)
          throw new Error(`IFC type relation #${relationId} has no type.`);
        for (const { value } of relation.RelatedObjects ?? []) {
          if (!this.candidates.has(value)) continue;
          const previous = this.occurrenceTypes.get(value);
          this.occurrenceTypes.set(
            value,
            previous !== undefined && previous !== relation.RelatingType.value
              ? null
              : relation.RelatingType.value,
          );
        }
      }
      progress("Reading occurrence property relationships");
      for (const relationId of this.ids(IFCRELDEFINESBYPROPERTIES)) {
        const relation = this.entity(relationId);
        const definition = relation.RelatingPropertyDefinition;
        if (!definition) continue;
        const sets = (
          Array.isArray(definition) ? definition : [definition]
        ).map((ref) => ref.value);
        for (const { value } of relation.RelatedObjects ?? []) {
          if (!this.candidates.has(value)) continue;
          const existing = this.occurrenceSets.get(value) ?? [];
          existing.push(...sets);
          this.occurrenceSets.set(value, existing);
        }
      }
      const candidates: Candidate[] = [];
      for (const elementId of this.candidates) {
        if (candidates.length % 1000 === 0)
          progress(
            `Classifying ${candidates.length.toLocaleString()} / ${this.candidates.size.toLocaleString()} physical elements`,
          );
        const typeId = this.occurrenceTypes.get(elementId);
        let type: Entity | undefined;
        if (typeId) {
          type = this.typeEntities.get(typeId) ?? this.entity(typeId);
          this.typeEntities.set(typeId, type);
        }
        const instanceCategory = this.category(
          this.occurrenceSets.get(elementId) ?? [],
          purpose,
        );
        candidates.push({
          elementId,
          instanceCategory,
          typeCategory:
            instanceCategory === undefined
              ? this.category(
                  type?.HasPropertySets?.map((ref) => ref.value) ?? [],
                  purpose,
                )
              : undefined,
          type: type?.GlobalId?.value
            ? {
                globalId: type.GlobalId.value,
                name: type.Name?.value ?? "",
                ifcClass: this.api.GetNameFromTypeCode(type.type).toUpperCase(),
              }
            : null,
        });
      }
      const index = buildCatalog(model, candidates);
      const projects = this.ids(IFCPROJECT);
      const projectId = projects.length === 1 ? projects[0] : undefined;
      const assignment =
        projectId === undefined ? null : this.entity(projectId).UnitsInContext;
      const unitIds = assignment
        ? (this.entity(assignment.value).Units?.map((ref) => ref.value) ?? [])
        : [];
      this.analysis = {
        index,
        sourceName: model.name ?? model.id,
        units: new AnalysisUnits(
          (id) => this.api.GetLine(this.current, id, false),
          unitIds,
        ),
      };
      progress(`Indexed ${index.types.length.toLocaleString()} asset types`);
      return index;
    } catch (error) {
      this.close();
      throw new Error(
        `IFC indexing failed: ${error instanceof Error ? error.message : "Unknown parser failure"}`,
        { cause: error },
      );
    }
  }

  private classification(setIds: number[]): { present: boolean; value: string | undefined; issues: string[] } {
    const values = new Set<string>();
    const issues: string[] = [];
    let present = false;
    for (const id of new Set(setIds)) {
      let cached = this.classifications.get(id);
      if (!cached) {
        const set = this.entity(id);
        const setValues = new Set<string>();
        const setIssues: string[] = [];
        let setPresent = false;
        if (set.type === IFCPROPERTYSET && set.Name?.value === "Identity Data")
          for (const ref of set.HasProperties ?? []) {
            const property = this.entity(ref.value);
            if (property.Name?.value !== "Generic Hard Asset") continue;
            setPresent = true;
            if (property.type !== IFCPROPERTYSINGLEVALUE)
              setIssues.push(`Unsupported Generic Hard Asset property kind at #${ref.value}.`);
            else setValues.add(String(property.NominalValue?.value ?? "").trim());
          }
        if (setValues.size > 1)
          setIssues.push(`Conflicting Generic Hard Asset values in property set #${id}.`);
        cached = { present: setPresent, value: setIssues.length ? undefined : setValues.values().next().value, issues: setIssues };
        this.classifications.set(id, cached);
      }
      present ||= cached.present;
      issues.push(...cached.issues);
      if (cached.value !== undefined) values.add(cached.value);
    }
    if (values.size > 1)
      issues.push(`Conflicting Identity Data classifications in property sets ${setIds.join(", ")}.`);
    return { present, value: issues.length ? undefined : values.values().next().value, issues };
  }

  private category(setIds: number[], purpose: "browse" | "creation"): string | undefined {
    const classification = this.classification(setIds);
    if (classification.issues.length) {
      if (purpose === "browse") throw new Error(classification.issues[0]);
      return classification.present ? "" : undefined;
    }
    return classification.value;
  }

  discoverAssets(progress: Progress = () => {}): CreationIndex {
    const analysis = this.analysis;
    if (!analysis) throw new Error("Open an IFC model before creation discovery.");
    try {
      const occurrences: CreationOccurrence[] = [];
      for (const elementId of this.candidates) {
        if (occurrences.length % 1000 === 0)
          progress(`Discovering ${occurrences.length.toLocaleString()} / ${this.candidates.size.toLocaleString()} physical elements`);
        const element = this.entity(elementId);
        const typeId = this.occurrenceTypes.get(elementId);
        const type = typeId ? this.typeEntities.get(typeId) : undefined;
        const instance = this.classification(this.occurrenceSets.get(elementId) ?? []);
        const classification = instance.present ? instance : this.classification(type?.HasPropertySets?.map(ref => ref.value) ?? []);
        const typed = type?.GlobalId?.value?.trim() ? type : undefined;
        const identityEntity = typed ?? element;
        const globalId = identityEntity.GlobalId?.value?.trim();
        if (!globalId) throw new Error(`IFC component #${elementId} has no stable GlobalId.`);
        const ifcClass = this.api.GetNameFromTypeCode(identityEntity.type).toUpperCase();
        occurrences.push({
          identity: { kind: typed ? "type" : "element", globalId }, elementId, ifcClass,
          name: typed?.Name?.value?.trim() || element.Name?.value?.trim() || ifcClass,
          category: effectiveCategory(classification.value, undefined),
          classificationIssues: classification.issues,
        });
      }
      const index = buildCreationCatalog({ modelId: analysis.index.modelId, fingerprint: analysis.index.fingerprint }, occurrences);
      progress(`Discovered ${index.candidates.length.toLocaleString()} creation candidates`);
      return index;
    } catch (error) {
      this.close();
      throw error;
    }
  }

  private assertElement(elementId: number): void {
    if (!this.candidates.has(elementId))
      throw new Error(
        `Element #${elementId} is not a physical element in the open model.`,
      );
  }
  librarySnapshot(progress: Progress = () => {}): LibrarySnapshot {
    return this.analyze(this.analysis?.index, progress);
  }
  analyzeAssets(progress: Progress = () => {}): LibrarySnapshot {
    return this.analyze(this.discoverAssets(progress), progress);
  }
  private analyze(index: CatalogIndex | CreationIndex | undefined, progress: Progress): LibrarySnapshot {
    const analysis = this.analysis;
    if (!analysis || !index)
      throw new Error("Open an IFC model before library analysis.");
    return analyzeLibrary({
      index,
      sourceName: analysis.sourceName,
      progress,
      properties: (occurrenceId) => {
        const typeId = this.occurrenceTypes.get(occurrenceId);
        const type = typeId ? this.typeEntities.get(typeId) : undefined;
        const instance = this.observations(
          this.occurrenceSets.get(occurrenceId) ?? [],
          analysis.units,
          new Set(),
          "candidates" in index,
        );
        const fallback = this.observations(
          type?.HasPropertySets?.map((ref) => ref.value) ?? [],
          analysis.units,
          new Set(instance.map((field) => field.key)),
          "candidates" in index,
        );
        return [...fallback, ...instance];
      },
    });
  }
  private observations(
    setIds: number[],
    units: AnalysisUnits,
    overridden = new Set<string>(),
    creation = false,
  ): PropertyObservation[] {
    const fields = new Map<string, PropertyObservation[]>();
    for (const setId of new Set(setIds)) {
      let cached = this.propertySets.get(setId);
      if (!cached) {
        cached = [];
        const set = this.entity(setId);
        if (set.type === IFCPROPERTYSET)
          for (const ref of set.HasProperties ?? []) {
            const property = this.entity(ref.value);
            const pset = set.Name?.value ?? `Property set #${setId}`;
            const name = property.Name?.value ?? `Property #${ref.value}`;
            const scalarValue = property.type === IFCPROPERTYSINGLEVALUE;
            const measure = scalarValue
              ? (property.NominalValue?.name ?? "Unknown IFC measure")
              : this.api.GetNameFromTypeCode(property.type).toUpperCase();
            const list = property.ListValues ?? property.EnumerationValues;
            const rawValue = scalarValue
              ? String(property.NominalValue?.value ?? "")
              : list
                ? list.map((item) => item?.value ?? "").join(", ")
                : `[${measure} — not a scalar value]`;
            const resolved = units.forMeasure(measure, property.Unit?.value);
            const unit = resolved?.label ?? null;
            let normalized = normalizeObservation({
              value: rawValue,
              measure: "unsupported",
              unit,
            });
            if (
              scalarValue &&
              normalized.kind !== "missing" &&
              resolved?.factor !== null &&
              resolved?.factor !== undefined &&
              resolved.canonical &&
              typeof property.NominalValue?.value === "number"
            ) {
              const value = property.NominalValue.value * resolved.factor;
              if (Number.isFinite(value))
                normalized = {
                  kind: "number",
                  value,
                  unit: resolved.canonical,
                };
            }
            cached.push({
              key: JSON.stringify([pset, name]),
              pset,
              name,
              measure,
              unit,
              rawValue,
              normalized:
                normalized.kind === "text" && /MEASURE/.test(measure)
                  ? { ...normalized, unresolvedMeasure: true }
                  : normalized,
            });
          }
        this.propertySets.set(setId, cached);
      }
      for (const field of cached) {
        if (overridden.has(field.key)) continue;
        const existing = fields.get(field.key) ?? [];
        const previous = existing[0];
        if (!creation || field.pset !== "Identity Data" || field.name !== "Generic Hard Asset") {
          if (previous && (previous.rawValue !== field.rawValue ||
              !equalNormalized(previous.normalized, field.normalized)))
            throw new Error(`Conflicting properties for ${field.pset} / ${field.name} in one occurrence.`);
          fields.set(field.key, [field]);
          continue;
        }
        const equivalent = existing.findIndex(value => value.rawValue === field.rawValue &&
          equalNormalized(value.normalized, field.normalized));
        if (equivalent >= 0) {
          existing[equivalent] = field;
          continue;
        }
        existing.push(field);
        fields.set(field.key, existing);
      }
    }
    return [...fields.values()].flat();
  }
  properties(elementId: number): PropertyGroup[] {
    this.assertElement(elementId);
    const groups: PropertyGroup[] = [];
    const add = (id: number, source: PropertyGroup["source"]) => {
      const entity = this.entity(id);
      groups.push({
        name: "IFC identity",
        source,
        values: [
          { name: "Express ID", value: String(id) },
          {
            name: "IFC class",
            value: this.api.GetNameFromTypeCode(entity.type),
          },
          { name: "GlobalId", value: entity.GlobalId?.value ?? "" },
          { name: "Name", value: entity.Name?.value ?? "" },
          { name: "Description", value: entity.Description?.value ?? "" },
        ],
      });
      const setIds =
        source === "instance"
          ? (this.occurrenceSets.get(id) ?? [])
          : (entity.HasPropertySets?.map((ref) => ref.value) ?? []);
      for (const setId of new Set(setIds)) {
        const set = this.entity(setId);
        if (set.type !== IFCPROPERTYSET) continue;
        groups.push({
          name: set.Name?.value ?? `Property set #${setId}`,
          source,
          values: (set.HasProperties ?? []).map((ref) => {
            const property = this.entity(ref.value);
            const list = property.ListValues ?? property.EnumerationValues;
            return {
              name: property.Name?.value ?? `#${ref.value}`,
              value:
                property.type === IFCPROPERTYSINGLEVALUE
                  ? String(property.NominalValue?.value ?? "")
                  : list
                    ? list.map((item) => item?.value ?? "").join(", ")
                    : `[${this.api.GetNameFromTypeCode(property.type)} — not a scalar value]`,
            };
          }),
        });
      }
    };
    add(elementId, "instance");
    const typeId = this.occurrenceTypes.get(elementId);
    if (typeId) add(typeId, "type");
    return groups;
  }

  geometry(elementId: number): PreviewGeometry {
    this.assertElement(elementId);
    const flat = this.api.GetFlatMesh(this.current, elementId, true);
    const meshes: PreviewGeometry["meshes"] = [];
    try {
      for (let i = 0; i < flat.geometries.size(); i++) {
        const placed = flat.geometries.get(i);
        const geometry = this.api.GetGeometry(
          this.current,
          placed.geometryExpressID,
        );
        try {
          const vertices = this.api.GetVertexArray(
            geometry.GetVertexData(),
            geometry.GetVertexDataSize(),
          );
          const indices = new Uint32Array(
            this.api.GetIndexArray(
              geometry.GetIndexData(),
              geometry.GetIndexDataSize(),
            ),
          );
          if (!vertices.length || !indices.length) continue;
          const positions = new Float32Array(vertices.length / 2);
          const normals = new Float32Array(vertices.length / 2);
          for (let vertex = 0; vertex < vertices.length / 6; vertex++) {
            positions.set(
              vertices.subarray(vertex * 6, vertex * 6 + 3),
              vertex * 3,
            );
            normals.set(
              vertices.subarray(vertex * 6 + 3, vertex * 6 + 6),
              vertex * 3,
            );
          }
          meshes.push({
            positions,
            normals,
            indices,
            transform: Array.from(placed.flatTransformation),
            color: [
              placed.color.x,
              placed.color.y,
              placed.color.z,
              placed.color.w,
            ],
          });
        } finally {
          geometry.delete();
        }
      }
    } finally {
      release(flat.geometries);
      release(flat);
    }
    if (!meshes.length)
      throw new Error(
        `Element #${elementId} has no supported preview geometry. Try another occurrence of this type.`,
      );
    return { meshes };
  }

  close(): void {
    if (this.modelId !== null) this.api.CloseModel(this.modelId);
    this.modelId = null;
    this.analysis = null;
    this.propertySets.clear();
    this.candidates.clear();
    this.occurrenceSets.clear();
    this.occurrenceTypes.clear();
    this.typeEntities.clear();
    this.classifications.clear();
  }
  dispose(): void {
    this.close();
    this.api.Dispose();
  }
}
