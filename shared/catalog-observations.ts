import type {
  CatalogLibrary,
  FieldSuggestion,
  LibraryEntry,
  NormalizedValue,
  ObservedField,
  SourceRecord,
} from "./catalog-library.js";
import { equalNormalized } from "./catalog-normalization.js";
const installationFieldNames = new Set(
  [
    "IfcGUID", "Type IfcGUID", "Revit (GUID)", "GUID", "Functional Location",
    "Workset", "Project ID", "System Instance Number", "Component Instance Number",
    "Asset Name", "Asset Status", "Default Elevation", "Elevation", "Elevation from Level",
    "Host", "Moves With Nearby Elements", "Phase Created", "Phase Demolished", "Type Id",
    "Export to IFC", "Export Type to IFC",
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
  return state.sources.find((source) => source.id === sourceId);
}
export function entryFieldSuggestions(
  state: CatalogLibrary,
  entry: LibraryEntry,
): FieldSuggestion[] {
  const keys = new Set<string>();
  for (const reference of entry.sourceReferences) {
    const source = sourceFor(state, reference.sourceId);
    source?.observation.fields
      .filter(reusableField)
      .forEach((field) => keys.add(field.key));
  }
  return [...keys].sort().map((key) => {
    const values: NormalizedValue[] = [];
    const missingOccurrences: number[] = [];
    for (const reference of entry.sourceReferences) {
      const source = sourceFor(state, reference.sourceId);
      const field = source?.observation.fields.find(
        (candidate) => candidate.key === key,
      );
      for (const occurrenceId of reference.occurrenceIds) {
        const observed =
          field?.values.filter((value) =>
            value.occurrenceIds.includes(occurrenceId),
          ) ?? [];
        if (
          !observed.length ||
          observed.some((value) => value.normalized.kind === "missing")
        )
          missingOccurrences.push(occurrenceId);
        for (const value of observed) {
          if (
            value.normalized.kind !== "missing" &&
            !values.some((existing) =>
              equalNormalized(existing, value.normalized),
            )
          )
            values.push(value.normalized);
        }
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
    };
  });
}
export function comparableSpecifications(
  state: CatalogLibrary,
  entry: LibraryEntry,
): Record<string, NormalizedValue> {
  const values: Record<string, NormalizedValue> = {};
  for (const suggestion of entryFieldSuggestions(state, entry)) {
    const value = suggestion.values[0];
    if (suggestion.status === "consistent" && value)
      values[suggestion.key] = value;
  }
  return { ...values, ...entry.definition.specifications };
}
