import type { AssetType } from "../../shared/contracts.js";
import { typeNameKey } from "../../shared/catalog-type-groups.js";

export function groupAssetTypes(types: AssetType[]): AssetType[] {
  const groups = new Map<string, AssetType>();
  for (const type of types) {
    const key = typeNameKey(type.name) || type.id;
    const group = groups.get(key);
    if (group) {
      group.categories = [...new Set([...group.categories, ...type.categories])];
      group.occurrenceIds = [...new Set([...group.occurrenceIds, ...type.occurrenceIds])];
    } else groups.set(key, { ...type, categories: [...type.categories], occurrenceIds: [...type.occurrenceIds] });
  }
  return [...groups.values()];
}
