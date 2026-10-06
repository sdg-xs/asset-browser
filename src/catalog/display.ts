import type {
  CatalogLibrary,
  LibraryEntry,
  NormalizedValue,
} from "../../shared/catalog-library.js";
import {
  effectiveSpecifications,
  parameterLabel,
} from "../../shared/catalog-observations.js";
const numberFormat = new Intl.NumberFormat("en", {
  maximumSignificantDigits: 7,
  useGrouping: false,
});
export function valueText(value: NormalizedValue) {
  return value.kind === "missing"
    ? "Unknown"
    : String(
        value.kind === "number"
          ? numberFormat.format(value.value)
          : value.value,
      ) + (value.unit ? " " + value.unit : "");
}
export const fieldLabel = parameterLabel;
export function entryFieldLabel(
  state: CatalogLibrary,
  entry: LibraryEntry,
  key: string,
) {
  return (
    state.templates
      .find((t) => t.categoryId === entry.definition.categoryId)
      ?.mappings.find((m) => m.key === key)?.label ??
    (entry.status === "approved"
      ? entry.publication?.labels[key]
      : undefined) ??
    fieldLabel(state, key, entry.definition.categoryId)
  );
}
export function entrySpecifications(
  state: CatalogLibrary,
  entry: LibraryEntry,
) {
  return entry.status === "approved" && entry.publication
    ? entry.publication.specifications
    : effectiveSpecifications(state, entry);
}
