import type {
  CatalogLibrary,
  FieldSuggestion,
  LibraryEntry,
  NormalizedValue,
  ObservedField,
  SourceRecord,
  FieldMapping,
} from "./catalog-library.js";
import { equalNormalized } from "./catalog-normalization.js";
const installationFieldNames = new Set(
  [
    "IfcGUID",
    "Type IfcGUID",
    "Revit (GUID)",
    "GUID",
    "Functional Location",
    "Workset",
    "Project ID",
    "System Instance Number",
    "Component Instance Number",
    "Asset Name",
    "Asset Status",
    "Default Elevation",
    "Elevation",
    "Elevation from Level",
    "Host",
    "Moves With Nearby Elements",
    "Phase Created",
    "Phase Demolished",
    "Type Id",
    "Export to IFC",
    "Export Type to IFC",
  ].map((name) => name.toLowerCase().replace(/\s/g, "")),
);

export function reusableField(field: Pick<ObservedField, "name">): boolean {
  const installationMetadata = installationFieldNames.has(
    field.name.toLowerCase().replace(/\s/g, ""),
  );
  const spatialLevel =
    /^(?:(?:building|storey|floor|reference|base|top|schedule|constraint)\s*)?level(?:\s*(?:name|id|number))?$/i.test(
      field.name.trim(),
    );
  return (
    !spatialLevel &&
    !installationMetadata &&
    !/^(?:product\s*(?:code|id|number)|sku|(?:manufacturer\s*)?(?:art\.?\s*no\.?|article\s*(?:number|no\.?)|part\s*(?:number|no\.?)))$/i.test(
      field.name.trim(),
    ) &&
    !/(?:globalid|expressid|asset.?id|room|offset|placement|installation|manufacturer|model(?:number)?|generic hard asset)/i.test(
      field.name,
    )
  );
}
export function sourceFor(
  state: CatalogLibrary,
  sourceId: string,
): SourceRecord | undefined {
  return catalogIndex(state).sources.get(sourceId);
}
const indexes = new WeakMap<
  CatalogLibrary,
  {
    sources: Map<string, SourceRecord>;
    fields: Map<string, string>;
    suggestions: WeakMap<LibraryEntry, FieldSuggestion[]>;
  }
>();
function catalogIndex(state: CatalogLibrary) {
  let index = indexes.get(state);
  if (!index) {
    index = {
      sources: new Map(state.sources.map((s) => [s.id, s])),
      fields: new Map(),
      suggestions: new WeakMap(),
    };
    for (const source of state.sources)
      for (const field of source.observation.fields)
        index.fields.set(field.key, field.name);
    indexes.set(state, index);
  }
  return index;
}
export function parameterSourceKeys(
  mapping: Pick<FieldMapping, "key" | "sourceKeys">,
): string[] {
  return mapping.sourceKeys ?? [mapping.key];
}
export function parameterLabel(
  state: CatalogLibrary,
  key: string,
  categoryId: string | null,
): string {
  return (
    state.templates
      .find((t) => t.categoryId === categoryId)
      ?.mappings.find((m) => m.key === key)?.label ??
    state.templates
      .find((t) => t.categoryId === categoryId)
      ?.suggestions.find((m) => m.key === key)?.label ??
    catalogIndex(state).fields.get(key) ??
    key
  );
}
export function parameterKeys(
  state: CatalogLibrary,
  entry: LibraryEntry,
  key: string,
): string[] {
  const mapping = state.templates
    .find((t) => t.categoryId === entry.definition.categoryId)
    ?.mappings.find((m) => m.key === key);
  return mapping ? parameterSourceKeys(mapping) : [key];
}
export function occurrenceParameterValues(
  source: SourceRecord,
  keys: string[],
  occurrenceId: number,
): NormalizedValue[] {
  const values: NormalizedValue[] = [];
  for (const field of source.observation.fields) {
    if (!keys.includes(field.key)) continue;
    for (const value of field.values) {
      if (
        value.occurrenceIds.includes(occurrenceId) &&
        value.normalized.kind !== "missing" &&
        !values.some((v) => equalNormalized(v, value.normalized))
      )
        values.push(value.normalized);
    }
  }
  return values;
}
export function entryFieldSuggestions(
  state: CatalogLibrary,
  entry: LibraryEntry,
): FieldSuggestion[] {
  const cache = catalogIndex(state).suggestions;
  const cached = cache.get(entry);
  if (cached) return cached;
  const mappings =
    state.templates.find((t) => t.categoryId === entry.definition.categoryId)
      ?.mappings ?? [];
  const rawKeys = new Set(
    entry.sourceReferences.flatMap(
      (r) =>
        sourceFor(state, r.sourceId)
          ?.observation.fields.filter(reusableField)
          .map((f) => f.key) ?? [],
    ),
  );
  const keys = new Set<string>();
  for (const key of rawKeys)
    keys.add(
      mappings.find((m) => parameterSourceKeys(m).includes(key))?.key ?? key,
    );
  const suggestions = [...keys].sort().map((key) => {
    const sourceKeys = parameterKeys(state, entry, key);
    const values: NormalizedValue[] = [];
    const missingOccurrences: number[] = [];
    for (const reference of entry.sourceReferences) {
      const source = sourceFor(state, reference.sourceId);
      const perOccurrence = new Map<number, NormalizedValue[]>();
      for (const field of source?.observation.fields ?? []) {
        if (!sourceKeys.includes(field.key)) continue;
        for (const observed of field.values) {
          if (observed.normalized.kind === "missing") continue;
          for (const occurrence of observed.occurrenceIds) {
            const existing = perOccurrence.get(occurrence) ?? [];
            if (!existing.some((v) => equalNormalized(v, observed.normalized)))
              existing.push(observed.normalized);
            perOccurrence.set(occurrence, existing);
          }
        }
      }
      for (const occurrenceId of reference.occurrenceIds) {
        const observed = perOccurrence.get(occurrenceId) ?? [];
        if (!observed.length) missingOccurrences.push(occurrenceId);
        for (const value of observed)
          if (!values.some((existing) => equalNormalized(existing, value)))
            values.push(value);
      }
    }
    return {
      key,
      status:
        values.length > 1
          ? "conflicting"
          : !values.length || missingOccurrences.length
            ? "missing"
            : "consistent",
      values,
      missingOccurrences,
    } satisfies FieldSuggestion;
  });
  cache.set(entry, suggestions);
  return suggestions;
}
export function effectiveSpecifications(
  state: CatalogLibrary,
  entry: LibraryEntry,
): Record<string, NormalizedValue> {
  const mappings =
    state.templates.find((t) => t.categoryId === entry.definition.categoryId)
      ?.mappings ?? [];
  const values: Record<string, NormalizedValue> = {};
  for (const suggestion of entryFieldSuggestions(state, entry)) {
    const value = suggestion.values[0];
    if (
      suggestion.status === "consistent" &&
      value &&
      mappings.some((m) => m.key === suggestion.key)
    )
      values[suggestion.key] = value;
  }
  return { ...values, ...entry.definition.specifications };
}
export function comparableSpecifications(
  state: CatalogLibrary,
  entry: LibraryEntry,
): Record<string, NormalizedValue> {
  if (entry.status === "approved" && entry.publication)
    return entry.publication.specifications;
  const values: Record<string, NormalizedValue> = {};
  for (const suggestion of entryFieldSuggestions(state, entry)) {
    const value = suggestion.values[0];
    if (suggestion.status === "consistent" && value)
      values[suggestion.key] = value;
  }
  return { ...values, ...entry.definition.specifications };
}
export function hasUnnormalizedMeasure(
  state: CatalogLibrary,
  entry: LibraryEntry,
  key: string,
): boolean {
  const override = entry.definition.specifications[key];
  if (override?.kind === "text" && override.unresolvedMeasure) return true;
  if (Object.hasOwn(entry.definition.specifications, key)) return false;
  const keys = parameterKeys(state, entry, key);
  return entry.sourceReferences.some(
    (r) =>
      sourceFor(state, r.sourceId)?.observation.fields.some(
        (f) =>
          keys.includes(f.key) &&
          f.values.some(
            (v) =>
              v.occurrenceIds.some((id) => r.occurrenceIds.includes(id)) &&
              v.normalized.kind === "text" &&
              (v.normalized.unit !== null ||
                /MEASURE|Mixed IFC measures/i.test(
                  v.sourceMeasure ?? f.measure,
                )),
          ),
      ) ?? false,
  );
}
