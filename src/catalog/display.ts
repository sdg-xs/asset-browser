import type {
  CatalogLibrary,
  LibraryEntry,
  NormalizedValue,
} from "../../shared/catalog-library.js";
import { entryFieldSuggestions } from "../../shared/catalog-rules.js";
export function valueText(value: NormalizedValue) {
  return value.kind === "missing"
    ? "Unknown"
    : `${value.value}${value.unit ? ` ${value.unit}` : ""}`;
}
export function fieldLabel(
  state: CatalogLibrary,
  key: string,
  categoryId: string | null,
) {
  return (
    state.templates
      .find((template) => template.categoryId === categoryId)
      ?.mappings.find((f) => f.key === key)?.label ??
    state.sources
      .flatMap((s) => s.observation.fields)
      .find((f) => f.key === key)?.name ??
    key
  );
}
export function entrySpecifications(
  state: CatalogLibrary,
  entry: LibraryEntry,
) {
  const values: Record<string, NormalizedValue> = {};
  const mappings =
    state.templates.find((t) => t.categoryId === entry.definition.categoryId)
      ?.mappings ?? [];
  for (const suggestion of entryFieldSuggestions(state, entry)) {
    const value = suggestion.values[0];
    if (
      value &&
      suggestion.status === "consistent" &&
      mappings.some((m) => m.key === suggestion.key)
    )
      values[suggestion.key] = value;
  }
  return { ...values, ...entry.definition.specifications };
}
