import type {
  CatalogLibrary,
  FieldSuggestion,
  LibraryEntry,
  NormalizedValue,
  ObservedField,
  SourceRecord,
} from "./catalog-library.js";
import { equalNormalized } from "./catalog-normalization.js";

export function reusableField(field: ObservedField): boolean {
  return !/(?:globalid|expressid|asset.?id|room|level|offset|placement|installation|manufacturer|model(?:number)?|generic hard asset)/i.test(
    field.name,
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
