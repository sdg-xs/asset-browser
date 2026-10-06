import type {
  LibraryEntry,
  SourceReference,
  SourceRebinding,
} from "./catalog-library.js";
import { CatalogDomainError } from "./catalog-errors.js";

export function referenceKey(
  reference: Pick<SourceReference, "sourceId" | "fingerprint">,
): string {
  return JSON.stringify([reference.sourceId, reference.fingerprint]);
}
export function changedReferences(
  entry: LibraryEntry,
  references: SourceReference[],
  rebindings: SourceRebinding[] = [],
): SourceReference[] {
  return referenceChanges(entry, references, rebindings, true);
}
function referenceChanges(
  entry: LibraryEntry,
  references: SourceReference[],
  rebindings: SourceRebinding[],
  confirmPreferred: boolean,
): SourceReference[] {
  const reject = () => {
    throw new CatalogDomainError(
      "INVALID_COMMAND",
      "Retain each historical source revision exactly once; explicitly rebind unmatched revisions.",
    );
  };
  if (rebindings.length) {
    const rebound = new Map<string, SourceRebinding>();
    for (const binding of rebindings) {
      const key = referenceKey({
        sourceId: binding.sourceId,
        fingerprint: binding.fromFingerprint,
      });
      if (
        rebound.has(key) ||
        binding.fromFingerprint === binding.toFingerprint ||
        !entry.sourceReferences.some((r) => referenceKey(r) === key) ||
        !binding.occurrenceIds.length ||
        new Set(binding.occurrenceIds).size !== binding.occurrenceIds.length
      )
        reject();
      rebound.set(key, binding);
    }
    const transformed = consolidateReferences(
      entry.sourceReferences.map((r) => {
        const binding = rebound.get(referenceKey(r));
        return binding
          ? {
              ...r,
              fingerprint: binding.toFingerprint,
              occurrenceIds: binding.occurrenceIds,
            }
          : r;
      }),
    );
    const targets = new Set(
      rebindings.map((b) =>
        referenceKey({ sourceId: b.sourceId, fingerprint: b.toFingerprint }),
      ),
    );
    for (const key of targets) {
      const expected = transformed.find((r) => referenceKey(r) === key),
        actual = references.find((r) => referenceKey(r) === key);
      if (
        !expected ||
        !actual ||
        expected.occurrenceIds.length !== actual.occurrenceIds.length ||
        expected.occurrenceIds.some((id) => !actual.occurrenceIds.includes(id))
      )
        reject();
    }
    const changed = referenceChanges(
      { ...entry, sourceReferences: transformed },
      references,
      [],
      false,
    );
    return references.filter(
      (r) => targets.has(referenceKey(r)) || changed.includes(r),
    );
  }
  if (new Set(references.map(referenceKey)).size !== references.length)
    reject();
  // Match retained revisions before considering explicit replacement of an old revision.
  const priorByKey = new Map(
    entry.sourceReferences.map((r) => [referenceKey(r), r]),
  );
  const matches = new Map<SourceReference, SourceReference>();
  for (const reference of references) {
    const prior = priorByKey.get(referenceKey(reference));
    if (prior) {
      matches.set(reference, prior);
      priorByKey.delete(referenceKey(reference));
    }
  }
  for (const reference of references.filter((r) => !matches.has(r))) {
    const candidates = [...priorByKey.values()].filter(
      (r) => r.sourceId === reference.sourceId,
    );
    if (candidates.length !== 1) reject();
    const prior = candidates[0];
    if (prior) {
      matches.set(reference, prior);
      priorByKey.delete(referenceKey(prior));
    }
  }
  if (priorByKey.size) reject();
  const changed = references.filter((reference, index) => {
    const prior = matches.get(reference);
    return (
      !prior ||
      (index === 0 &&
        (!entry.sourceReferences[0] ||
          referenceKey(entry.sourceReferences[0]) !==
            referenceKey(reference))) ||
      prior.fingerprint !== reference.fingerprint ||
      prior.equivalent !== reference.equivalent ||
      prior.occurrenceIds.length !== reference.occurrenceIds.length ||
      prior.occurrenceIds.some((id, i) => id !== reference.occurrenceIds[i])
    );
  });
  return changed.length || !confirmPreferred ? changed : references.slice(0, 1);
}

export function consolidateReferences(
  references: SourceReference[],
): SourceReference[] {
  const groups = new Map<string, SourceReference>();
  for (const reference of references) {
    const key = referenceKey(reference),
      prior = groups.get(key);
    if (prior) {
      prior.occurrenceIds = [
        ...new Set([...prior.occurrenceIds, ...reference.occurrenceIds]),
      ];
      prior.equivalent ||= reference.equivalent;
    } else
      groups.set(key, {
        ...reference,
        occurrenceIds: [...reference.occurrenceIds],
      });
  }
  return [...groups.values()];
}
