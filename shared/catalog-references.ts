import type { LibraryEntry, SourceReference } from "./catalog-library.js";
import { CatalogDomainError } from "./catalog-errors.js";

export function changedReferences(
  entry: LibraryEntry,
  references: SourceReference[],
): SourceReference[] {
  if (
    new Set(references.map((r) => r.sourceId)).size !== references.length ||
    entry.sourceReferences.some(
      (old) => !references.some((r) => r.sourceId === old.sourceId),
    )
  )
    throw new CatalogDomainError(
      "INVALID_COMMAND",
      "Retain each historical source reference exactly once.",
    );
  const changed = references.filter((reference, index) => {
    const prior = entry.sourceReferences.find(
      (r) => r.sourceId === reference.sourceId,
    );
    return (
      !prior ||
      (index === 0 &&
        entry.sourceReferences[0]?.sourceId !== reference.sourceId) ||
      prior.fingerprint !== reference.fingerprint ||
      prior.equivalent !== reference.equivalent ||
      prior.occurrenceIds.length !== reference.occurrenceIds.length ||
      prior.occurrenceIds.some((id, i) => id !== reference.occurrenceIds[i])
    );
  });
  return changed.length ? changed : references.slice(0, 1);
}
