import type { CatalogLibrary, LibraryEntry } from "./catalog-library.js";
import {
  effectiveSpecifications,
  parameterLabel,
  hasUnnormalizedMeasure,
} from "./catalog-observations.js";

export function acceptPublication(
  state: CatalogLibrary,
  entry: LibraryEntry,
): void {
  const specifications = structuredClone(effectiveSpecifications(state, entry));
  entry.publication = {
    specifications,
    labels: Object.fromEntries(
      Object.keys(specifications).map((key) => [
        key,
        parameterLabel(state, key, entry.definition.categoryId),
      ]),
    ),
  };
}

/** Additive schema-1 compatibility: retain existing keys and curated decisions. */
export function migrateCatalog(state: CatalogLibrary): CatalogLibrary {
  for (const template of state.templates)
    for (const mapping of [...template.mappings, ...template.suggestions])
      mapping.sourceKeys ??= [mapping.key];
  for (const source of state.sources)
    for (const field of source.observation.fields)
      for (const value of field.values) {
        if (value.sourceUnit === undefined) value.sourceUnit = field.unit;
        value.sourceMeasure ??= field.measure;
        if (
          value.normalized.kind === "text" &&
          /MEASURE|Mixed IFC measures/i.test(value.sourceMeasure)
        )
          value.normalized.unresolvedMeasure = true;
      }
  for (const entry of state.entries)
    for (const [key, value] of Object.entries(entry.definition.specifications))
      if (value.kind === "text" && hasUnnormalizedMeasure(state, entry, key))
        value.unresolvedMeasure = true;
  for (const entry of state.entries)
    if (entry.status === "approved" && !entry.publication) {
      const stale = entry.sourceReferences.some((r) => {
        const source = state.sources.find((s) => s.id === r.sourceId);
        return !source || source.fingerprint !== r.fingerprint;
      });
      if (stale) {
        entry.publication = {
          specifications: structuredClone(entry.definition.specifications),
          labels: Object.fromEntries(
            Object.keys(entry.definition.specifications).map((key) => [
              key,
              parameterLabel(state, key, entry.definition.categoryId),
            ]),
          ),
        };
        if (!entry.reviewFlags.includes("source-changed"))
          entry.reviewFlags.push("source-changed");
      } else acceptPublication(state, entry);
    }
  return state;
}
