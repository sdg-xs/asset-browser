import { z } from "zod";
const id = z.string().min(1);
const occurrenceIds = z.array(z.number().int().nonnegative());
export const normalizedValueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("missing") }),
  z.object({
    kind: z.literal("number"),
    value: z.number().finite(),
    unit: z.string(),
  }),
  z.object({
    kind: z.literal("text"),
    value: z.string(),
    unit: z.string().nullable(),
  }),
]);
export type NormalizedValue = z.infer<typeof normalizedValueSchema>;
export const observedFieldSchema = z.object({
  key: id,
  pset: z.string(),
  name: z.string(),
  measure: z.string(),
  unit: z.string().nullable(),
  values: z.array(
    z.object({
      rawValue: z.string(),
      normalized: normalizedValueSchema,
      occurrenceIds,
    }),
  ),
});
export type ObservedField = z.infer<typeof observedFieldSchema>;
export const sourceTypeObservationSchema = z.object({
  typeGlobalId: id,
  name: z.string(),
  ifcClass: z.string(),
  categories: z.array(z.string()),
  occurrenceIds,
  fields: z.array(observedFieldSchema),
});
export type SourceTypeObservation = z.infer<typeof sourceTypeObservationSchema>;
export const librarySnapshotSchema = z.object({
  modelId: id,
  fingerprint: id,
  sourceName: z.string(),
  types: z.array(sourceTypeObservationSchema),
});
export type LibrarySnapshot = z.infer<typeof librarySnapshotSchema>;
export const fieldMappingSchema = z.object({
  key: id,
  label: z.string(),
  dataKind: z.enum(["number", "text"]),
  canonicalUnit: z.string().nullable(),
  role: z.enum(["specification", "variant"]),
});
export type FieldMapping = z.infer<typeof fieldMappingSchema>;
export const catalogCategorySchema = z.object({
  id,
  name: z.string(),
  aliases: z.array(z.string()),
});
export type CatalogCategory = z.infer<typeof catalogCategorySchema>;
export const categoryTemplateSchema = z.object({
  categoryId: id,
  mappings: z.array(fieldMappingSchema),
  suggestions: z.array(fieldMappingSchema),
});
export type CategoryTemplate = z.infer<typeof categoryTemplateSchema>;
export const identitySchema = z.object({
  value: z.string(),
  confirmed: z.boolean(),
});
export type CatalogIdentity = z.infer<typeof identitySchema>;
export const editableDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  kind: z.enum(["generic", "product"]),
  family: z.string().nullable(),
  categoryId: z.string().nullable(),
  tags: z.array(z.string()),
  manufacturer: identitySchema,
  model: identitySchema,
  specifications: z.record(z.string(), normalizedValueSchema),
});
export type EditableDefinition = z.infer<typeof editableDefinitionSchema>;
export const sourceReferenceSchema = z.object({
  sourceId: id,
  fingerprint: id,
  occurrenceIds,
  equivalent: z.boolean(),
});
export type SourceReference = z.infer<typeof sourceReferenceSchema>;
export const sourceRecordSchema = z.object({
  id,
  modelId: id,
  fingerprint: id,
  sourceName: z.string(),
  revision: z.number().int().positive(),
  current: z.boolean(),
  observation: sourceTypeObservationSchema,
});
export type SourceRecord = z.infer<typeof sourceRecordSchema>;
export const libraryEntrySchema = z.object({
  id,
  definition: editableDefinitionSchema,
  status: z.enum(["draft", "approved", "archived"]),
  sourceReferences: z.array(sourceReferenceSchema),
  reviewFlags: z.array(z.enum(["source-changed"])),
});
export type LibraryEntry = z.infer<typeof libraryEntrySchema>;
export const catalogLibrarySchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  categories: z.array(catalogCategorySchema),
  templates: z.array(categoryTemplateSchema),
  sources: z.array(sourceRecordSchema),
  entries: z.array(libraryEntrySchema),
});
export type CatalogLibrary = z.infer<typeof catalogLibrarySchema>;
const expectedRevision = z.number().int().nonnegative();
export const libraryCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("import"),
    expectedRevision,
    snapshot: librarySnapshotSchema,
  }),
  z.object({
    kind: z.literal("edit"),
    expectedRevision,
    entryId: id,
    definition: editableDefinitionSchema,
    confirmedSourceReferences: z.array(sourceReferenceSchema).optional(),
  }),
  ...(["approve", "archive", "restore"] as const).map((kind) =>
    z.object({
      kind: z.literal(kind),
      expectedRevision,
      entryIds: z.array(id).min(1),
    }),
  ),
  z.object({
    kind: z.literal("merge"),
    expectedRevision,
    targetId: id,
    absorbedIds: z.array(id).min(1),
  }),
  z.object({
    kind: z.literal("split"),
    expectedRevision,
    entryId: id,
    variantFieldKeys: z.array(id).min(1),
  }),
  z.object({
    kind: z.literal("category"),
    expectedRevision,
    id,
    name: z.string().trim().min(1),
    aliases: z.array(z.string().trim().min(1)),
  }),
  z.object({
    kind: z.literal("template"),
    expectedRevision,
    categoryId: id,
    mappings: z.array(fieldMappingSchema),
  }),
]);
export type LibraryCommand = z.infer<typeof libraryCommandSchema>;
export const duplicateCandidateSchema = z.object({
  entryId: id,
  confidence: z.enum(["identity", "specifications", "name"]),
  differences: z.array(z.string()),
  missingEvidence: z.array(z.string()),
});
export type DuplicateCandidate = z.infer<typeof duplicateCandidateSchema>;
export const fieldSuggestionSchema = z.object({
  key: id,
  status: z.enum(["consistent", "missing", "conflicting"]),
  values: z.array(normalizedValueSchema),
  missingOccurrences: occurrenceIds,
});
export type FieldSuggestion = z.infer<typeof fieldSuggestionSchema>;
