import type { CatalogLibrary, FieldMapping } from "./catalog-library.js";
import { parameterSourceKeys } from "./catalog-observations.js";

export function excludeSourceParameters(state: CatalogLibrary, names: string[]): void {
  state.excludedSourceParameterNames = [...new Set([
    ...(state.excludedSourceParameterNames ?? []),
    ...names.map((name) => name.trim().toLowerCase()),
  ])];
  const excluded = new Set(state.excludedSourceParameterNames);
  const rawKeys = new Set(state.sources.flatMap((source) =>
    source.observation.fields
      .filter((field) => excluded.has(field.name.trim().toLowerCase()))
      .map((field) => field.key),
  ));
  const categoryKeys = new Map<string, Set<string>>();
  for (const template of state.templates) {
    const removed = new Set(rawKeys);
    const keepMapping = (mapping: FieldMapping): boolean => {
      const sourceKeys = parameterSourceKeys(mapping).filter((key) => !rawKeys.has(key));
      if (!sourceKeys.length) {
        removed.add(mapping.key);
        return false;
      }
      mapping.sourceKeys = sourceKeys;
      return true;
    };
    template.mappings = template.mappings.filter(keepMapping);
    template.suggestions = template.suggestions.filter(keepMapping);
    categoryKeys.set(template.categoryId, removed);
  }
  for (const entry of state.entries) {
    const keys = categoryKeys.get(entry.definition.categoryId ?? "") ?? rawKeys;
    for (const key of keys) {
      delete entry.definition.specifications[key];
      if (entry.publication) {
        delete entry.publication.specifications[key];
        delete entry.publication.labels[key];
      }
    }
  }
}
