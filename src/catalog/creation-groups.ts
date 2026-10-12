import type { CreationCandidate, CreationIndex } from "../../shared/asset-creation.js";
import type { LibrarySnapshot } from "../../shared/catalog-library.js";
import { identifiedTypeKey } from "../../shared/catalog-type-groups.js";
import { sourceObservationKey } from "../../shared/catalog-source-identity.js";

export type CreationTypeRow = CreationCandidate & { candidateKeys: string[]; category: string };

export function creationTypeRows(index: CreationIndex, snapshot: LibrarySnapshot): CreationTypeRow[] {
  const observations = new Map(snapshot.types.map(type => [sourceObservationKey(type), type]));
  const rows = new Map<string, CreationTypeRow>();
  for (const candidate of index.candidates) {
    const observation = observations.get(candidate.key);
    const key = observation ? identifiedTypeKey(observation) : candidate.key;
    const existing = rows.get(key);
    if (existing) {
      existing.candidateKeys.push(candidate.key);
      existing.occurrenceIds.push(...candidate.occurrenceIds);
      existing.categories = [...new Set([...existing.categories, ...candidate.categories])];
      existing.classificationIssues = [...new Set([...existing.classificationIssues, ...candidate.classificationIssues])];
      if (existing.categories.length > 1 || existing.classificationIssues.length)
        existing.category = "Needs classification";
    } else {
      rows.set(key, {
        ...candidate, occurrenceIds: [...candidate.occurrenceIds], candidateKeys: [candidate.key],
        category: candidate.classificationIssues.length || candidate.categories.length > 1
          ? "Needs classification"
          : candidate.categories[0] ?? "Unclassified",
      });
    }
  }
  return [...rows.values()];
}
