import { z } from "zod";

export const CreationIdentitySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("type"), globalId: z.string().trim().min(1) }),
  z.object({ kind: z.literal("element"), globalId: z.string().trim().min(1) }),
]);
export type CreationIdentity = z.infer<typeof CreationIdentitySchema>;

export function creationCandidateKey(identity: CreationIdentity): string {
  return `${identity.kind}:${identity.globalId}`;
}

export const CreationCandidateSchema = z.object({
  key: z.string().min(1),
  identity: CreationIdentitySchema,
  name: z.string().trim().min(1),
  ifcClass: z.string().min(1),
  categories: z.array(z.string().trim().min(1)),
  classificationIssues: z.array(z.string().min(1)),
  occurrenceIds: z.array(z.int().positive()).min(1),
  representativeId: z.int().positive(),
}).superRefine((candidate, context) => {
  if (candidate.key !== creationCandidateKey(candidate.identity))
    context.addIssue({ code: "custom", message: "Candidate key must match its stable identity." });
  if (!candidate.occurrenceIds.includes(candidate.representativeId))
    context.addIssue({ code: "custom", message: "Representative must belong to the candidate." });
  if (new Set(candidate.occurrenceIds).size !== candidate.occurrenceIds.length)
    context.addIssue({ code: "custom", message: "Candidate members must be unique." });
  if (candidate.identity.kind === "element" && candidate.occurrenceIds.length !== 1)
    context.addIssue({ code: "custom", message: "An element candidate must contain one occurrence." });
});
export type CreationCandidate = z.infer<typeof CreationCandidateSchema>;

export const CreationIndexSchema = z.object({
  schemaVersion: z.literal(1),
  modelId: z.uuid(),
  fingerprint: z.string().min(1),
  candidates: z.array(CreationCandidateSchema),
  stats: z.object({
    elements: z.int().nonnegative(),
    candidates: z.int().nonnegative(),
    classified: z.int().nonnegative(),
    unclassified: z.int().nonnegative(),
    untyped: z.int().nonnegative(),
  }),
}).superRefine((index, context) => {
  const keys = new Set<string>();
  const members = new Set<number>();
  for (const candidate of index.candidates) {
    if (keys.has(candidate.key))
      context.addIssue({ code: "custom", message: "Creation candidate keys must be unique." });
    keys.add(candidate.key);
    for (const member of candidate.occurrenceIds) {
      if (members.has(member))
        context.addIssue({ code: "custom", message: "An occurrence may belong to only one candidate." });
      members.add(member);
    }
  }
  const classified = index.candidates.filter(candidate => candidate.categories.length > 0).length;
  const untyped = index.candidates.filter(candidate => candidate.identity.kind === "element").length;
  if (index.stats.elements !== members.size || index.stats.candidates !== keys.size ||
      index.stats.classified !== classified || index.stats.unclassified !== index.candidates.length - classified ||
      index.stats.untyped !== untyped)
    context.addIssue({ code: "custom", message: "Creation counts must match candidate membership and classification." });
});
export type CreationIndex = z.infer<typeof CreationIndexSchema>;
