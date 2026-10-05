import { IfcAPI, IFCELEMENT, IFCPROJECT, IFCRELDEFINESBYPROPERTIES, IFCRELDEFINESBYTYPE, IFCPROPERTYSET, IFCPROPERTYSINGLEVALUE, LogLevel } from 'web-ifc';
import { z } from 'zod';
import type { CatalogIndex, LibraryModel, PreviewGeometry, PropertyGroup } from '../../shared/contracts.js';
import { buildCatalog, type Candidate } from './catalog.js';

const reference = z.object({ value: z.int().positive() });
const textValue = z.object({ value: z.string() }).nullish();
const scalar = z.object({ value: z.union([z.string(), z.number(), z.boolean()]) }).nullish();
const entitySchema = z.object({
  expressID: z.int(), type: z.number(), GlobalId: textValue, Name: textValue, Description: textValue,
  RelatedObjects: z.array(reference).optional(), RelatingType: reference.optional(),
  RelatingPropertyDefinition: z.union([reference, z.array(reference)]).optional(),
  HasPropertySets: z.array(reference).nullish(), HasProperties: z.array(reference).optional(),
  NominalValue: scalar, EnumerationValues: z.array(scalar).nullish(), ListValues: z.array(scalar).nullish(),
});
type Entity = z.infer<typeof entitySchema>;
export type Progress = (message: string) => void;

// Published declarations claim FlatMesh.delete(), but 0.0.78 returns a plain object.
function release(value: unknown): void {
  if (typeof value === 'object' && value !== null && 'delete' in value && typeof value.delete === 'function') value.delete();
}

/** Owns exactly one parsed source. All web-ifc's untyped entity data is validated here. */
export class IfcReader {
  private api = new IfcAPI();
  private modelId: number | null = null;
  private candidates = new Set<number>();
  private occurrenceSets = new Map<number, number[]>();
  private occurrenceTypes = new Map<number, number | null>();
  private typeEntities = new Map<number, Entity>();
  private categories = new Map<number, string | undefined>();

  async initialize(wasmPath?: string): Promise<void> {
    if (wasmPath) this.api.SetWasmPath(wasmPath, true);
    await this.api.Init(undefined, true);
    this.api.SetLogLevel(LogLevel.LOG_LEVEL_ERROR);
  }

  private get current(): number {
    if (this.modelId === null) throw new Error('Open an IFC model before inspection.');
    return this.modelId;
  }
  private entity(id: number): Entity {
    const raw: unknown = this.api.GetLine(this.current, id, false);
    return entitySchema.parse(raw);
  }
  private ids(type: number, inherited = false): number[] {
    const vector = this.api.GetLineIDsWithType(this.current, type, inherited);
    try { return Array.from({ length: vector.size() }, (_, i) => vector.get(i)); }
    finally { release(vector); }
  }

  open(bytes: Uint8Array, model: Pick<LibraryModel, 'id' | 'fingerprint'>, progress: Progress = () => {}): CatalogIndex {
    this.close();
    if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes('ISO-10303-21;')) throw new Error('Invalid IFC STEP header.');
    try {
      progress('Opening IFC in the browser worker');
      const id = this.api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: false });
      if (id < 0) throw new Error('The IFC parser could not open this model.');
      this.modelId = id;
      if (!this.api.GetModelSchema(id) || this.ids(IFCPROJECT).length === 0) throw new Error('IFC has no valid project or supported schema.');
      progress('Reading physical elements and type relationships');
      this.candidates = new Set(this.ids(IFCELEMENT, true));
      for (const relationId of this.ids(IFCRELDEFINESBYTYPE)) {
        const relation = this.entity(relationId);
        if (!relation.RelatingType) throw new Error(`IFC type relation #${relationId} has no type.`);
        for (const { value } of relation.RelatedObjects ?? []) {
          if (!this.candidates.has(value)) continue;
          const previous = this.occurrenceTypes.get(value);
          this.occurrenceTypes.set(value, previous !== undefined && previous !== relation.RelatingType.value ? null : relation.RelatingType.value);
        }
      }
      progress('Reading occurrence property relationships');
      for (const relationId of this.ids(IFCRELDEFINESBYPROPERTIES)) {
        const relation = this.entity(relationId);
        const definition = relation.RelatingPropertyDefinition;
        if (!definition) continue;
        const sets = (Array.isArray(definition) ? definition : [definition]).map(ref => ref.value);
        for (const { value } of relation.RelatedObjects ?? []) {
          if (!this.candidates.has(value)) continue;
          const existing = this.occurrenceSets.get(value) ?? [];
          existing.push(...sets);
          this.occurrenceSets.set(value, existing);
        }
      }
      const candidates: Candidate[] = [];
      for (const elementId of this.candidates) {
        if (candidates.length % 1000 === 0) progress(`Classifying ${candidates.length.toLocaleString()} / ${this.candidates.size.toLocaleString()} physical elements`);
        const typeId = this.occurrenceTypes.get(elementId);
        let type: Entity | undefined;
        if (typeId) {
          type = this.typeEntities.get(typeId) ?? this.entity(typeId);
          this.typeEntities.set(typeId, type);
        }
        candidates.push({ elementId,
          instanceCategory: this.category(this.occurrenceSets.get(elementId) ?? []),
          typeCategory: this.category(type?.HasPropertySets?.map(ref => ref.value) ?? []),
          type: type?.GlobalId?.value ? { globalId: type.GlobalId.value, name: type.Name?.value ?? '', ifcClass: this.api.GetNameFromTypeCode(type.type).toUpperCase() } : null,
        });
      }
      const index = buildCatalog(model, candidates);
      progress(`Indexed ${index.types.length.toLocaleString()} asset types`);
      return index;
    } catch (error) {
      this.close();
      throw new Error(`IFC indexing failed: ${error instanceof Error ? error.message : 'Unknown parser failure'}`, { cause: error });
    }
  }

  private category(setIds: number[]): string | undefined {
    const values = new Set<string>();
    for (const id of setIds) {
      if (!this.categories.has(id)) {
        const set = this.entity(id);
        let value: string | undefined;
        if (set.type === IFCPROPERTYSET && set.Name?.value === 'Identity Data') {
          for (const ref of set.HasProperties ?? []) {
            const property = this.entity(ref.value);
            if (property.Name?.value !== 'Generic Hard Asset') continue;
            if (property.type !== IFCPROPERTYSINGLEVALUE) throw new Error(`Unsupported Generic Hard Asset property kind at #${ref.value}.`);
            const next = String(property.NominalValue?.value ?? '').trim();
            if (value !== undefined && value !== next) throw new Error(`Conflicting Generic Hard Asset values in property set #${id}.`);
            value = next;
          }
        }
        this.categories.set(id, value);
      }
      const value = this.categories.get(id);
      if (value !== undefined) values.add(value);
    }
    if (values.size > 1) throw new Error(`Conflicting Identity Data classifications in property sets ${setIds.join(', ')}.`);
    return values.values().next().value;
  }

  private assertElement(elementId: number): void {
    if (!this.candidates.has(elementId)) throw new Error(`Element #${elementId} is not a physical element in the open model.`);
  }
  properties(elementId: number): PropertyGroup[] {
    this.assertElement(elementId);
    const groups: PropertyGroup[] = [];
    const add = (id: number, source: PropertyGroup['source']) => {
      const entity = this.entity(id);
      groups.push({ name: 'IFC identity', source, values: [
        { name: 'Express ID', value: String(id) }, { name: 'IFC class', value: this.api.GetNameFromTypeCode(entity.type) },
        { name: 'GlobalId', value: entity.GlobalId?.value ?? '' }, { name: 'Name', value: entity.Name?.value ?? '' },
        { name: 'Description', value: entity.Description?.value ?? '' },
      ] });
      const setIds = source === 'instance' ? this.occurrenceSets.get(id) ?? [] : entity.HasPropertySets?.map(ref => ref.value) ?? [];
      for (const setId of new Set(setIds)) {
        const set = this.entity(setId);
        if (set.type !== IFCPROPERTYSET) continue;
        groups.push({ name: set.Name?.value ?? `Property set #${setId}`, source, values: (set.HasProperties ?? []).map(ref => {
          const property = this.entity(ref.value);
          const list = property.ListValues ?? property.EnumerationValues;
          return { name: property.Name?.value ?? `#${ref.value}`, value: property.type === IFCPROPERTYSINGLEVALUE ? String(property.NominalValue?.value ?? '')
            : list ? list.map(item => item?.value ?? '').join(', ') : `[${this.api.GetNameFromTypeCode(property.type)} — not a scalar value]` };
        }) });
      }
    };
    add(elementId, 'instance');
    const typeId = this.occurrenceTypes.get(elementId);
    if (typeId) add(typeId, 'type');
    return groups;
  }

  geometry(elementId: number): PreviewGeometry {
    this.assertElement(elementId);
    const flat = this.api.GetFlatMesh(this.current, elementId, true);
    const meshes: PreviewGeometry['meshes'] = [];
    try {
      for (let i = 0; i < flat.geometries.size(); i++) {
        const placed = flat.geometries.get(i);
        const geometry = this.api.GetGeometry(this.current, placed.geometryExpressID);
        try {
          const vertices = this.api.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize());
          const indices = new Uint32Array(this.api.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize()));
          if (!vertices.length || !indices.length) continue;
          const positions = new Float32Array(vertices.length / 2);
          const normals = new Float32Array(vertices.length / 2);
          for (let vertex = 0; vertex < vertices.length / 6; vertex++) {
            positions.set(vertices.subarray(vertex * 6, vertex * 6 + 3), vertex * 3);
            normals.set(vertices.subarray(vertex * 6 + 3, vertex * 6 + 6), vertex * 3);
          }
          meshes.push({ positions, normals, indices, transform: Array.from(placed.flatTransformation), color: [placed.color.x, placed.color.y, placed.color.z, placed.color.w] });
        } finally { geometry.delete(); }
      }
    } finally { release(flat.geometries); release(flat); }
    if (!meshes.length) throw new Error(`Element #${elementId} has no supported preview geometry. Try another occurrence of this type.`);
    return { meshes };
  }

  close(): void {
    if (this.modelId !== null) this.api.CloseModel(this.modelId);
    this.modelId = null;
    this.candidates.clear(); this.occurrenceSets.clear(); this.occurrenceTypes.clear(); this.typeEntities.clear(); this.categories.clear();
  }
  dispose(): void { this.close(); this.api.Dispose(); }
}
