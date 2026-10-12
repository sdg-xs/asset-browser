import type { LibraryEntry } from "../../shared/catalog-library.js";
import { typeNameKey } from "../../shared/catalog-type-groups.js";

export function definitionGroups(entries: LibraryEntry[]): Map<string, LibraryEntry[]> {
  const names = new Map<string, LibraryEntry[]>();
  const groups = new Map<string, LibraryEntry[]>();
  for (const entry of entries) {
    const name = typeNameKey(entry.definition.name) || entry.id;
    const group = names.get(name);
    if (group) group.push(entry);
    else {
      const members = [entry];
      names.set(name, members);
      groups.set(entry.id, members);
    }
  }
  return groups;
}
