import {
  CreationIndexSchema,
  creationCandidateKey,
  type CreationCandidate,
  type CreationIdentity,
  type CreationIndex,
} from "../../shared/asset-creation.js";

export interface CreationOccurrence {
  identity: CreationIdentity;
  name: string;
  ifcClass: string;
  elementId: number;
  category: string | null;
  classificationIssues: string[];
}

export function buildCreationCatalog(
  model: Pick<CreationIndex, "modelId" | "fingerprint">,
  occurrences: CreationOccurrence[],
): CreationIndex {
  const candidates = new Map<string, CreationCandidate>();
  for (const occurrence of occurrences) {
    const key = creationCandidateKey(occurrence.identity);
    let candidate = candidates.get(key);
    if (!candidate) {
      candidate = {
        key, identity: occurrence.identity, name: occurrence.name, ifcClass: occurrence.ifcClass,
        categories: [], classificationIssues: [], occurrenceIds: [], representativeId: occurrence.elementId,
      };
      candidates.set(key, candidate);
    }
    candidate.occurrenceIds.push(occurrence.elementId);
    if (occurrence.category && !candidate.categories.includes(occurrence.category))
      candidate.categories.push(occurrence.category);
    for (const issue of occurrence.classificationIssues)
      if (!candidate.classificationIssues.includes(issue)) candidate.classificationIssues.push(issue);
  }
  const values = [...candidates.values()];
  const classified = values.filter(candidate => candidate.categories.length > 0).length;
  return CreationIndexSchema.parse({
    schemaVersion: 1, ...model, candidates: values,
    stats: { elements: occurrences.length, candidates: values.length, classified,
      unclassified: values.length - classified, untyped: values.filter(candidate => candidate.identity.kind === "element").length },
  });
}
