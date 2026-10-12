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
    unresolvedMeasure: z.literal(true).optional(),
  }),
]);
export type NormalizedValue = z.infer<typeof normalizedValueSchema>;
export const observedFieldSchema = z.object({
  key: id,
  pset: z.string(),
  name: z.string(),
  measure: z.string(),
  unit: z.string().nullable(),
  origin: z.enum(["attribute", "quantity"]).optional(),
  values: z.array(
    z.object({
      rawValue: z.string(),
      sourceUnit: z.string().nullable().optional(),
      sourceMeasure: z.string().optional(),
      normalized: normalizedValueSchema,
      occurrenceIds,
    }),
  ),
});
export type ObservedField = z.infer<typeof observedFieldSchema>;
const observationProperties = {
  name: z.string(),
  ifcClass: z.string(),
  categories: z.array(z.string()),
  classificationIssues: z.array(z.string().min(1)).optional(),
  occurrenceIds,
  fields: z.array(observedFieldSchema),
};
export const sourceTypeObservationSchema = z.union([
  z.object({ typeGlobalId: id, ...observationProperties }),
  z.object({ typeGlobalId: z.null(), elementGlobalId: id, ...observationProperties }),
]);
export type SourceTypeObservation = z.infer<typeof sourceTypeObservationSchema>;
export const librarySnapshotSchema = z.object({
  analysisVersion: z.union([z.literal(2), z.literal(3)]).optional(),
  modelId: id,
  fingerprint: id,
  sourceName: z.string(),
  types: z.array(sourceTypeObservationSchema),
});
export type LibrarySnapshot = z.infer<typeof librarySnapshotSchema>;
export const fieldMappingSchema = z.object({
  key: id,
  sourceKeys: z.array(id).min(1).optional(),
  label: z.string(),
  dataKind: z.enum(["number", "text"]),
  canonicalUnit: z.string().nullable(),
  role: z.enum(["specification", "variant"]),
});
export type FieldMapping = z.infer<typeof fieldMappingSchema>;
export const uploadMappingsSchema = z.object({
  name: z.string(),
  ifcClass: z.string(),
  system: z.string(),
  fdvuDocumentationUrl: z.string(),
});
export type UploadMappings = z.infer<typeof uploadMappingsSchema>;
export const catalogCategorySchema = z.object({
  id,
  name: z.string(),
  aliases: z.array(z.string()),
  uploadMappings: uploadMappingsSchema.optional(),
  ifcClass: z.string().trim().optional(),
  system: z.string().trim().optional(),
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
export const fdvuDocumentationUrlSchema = z.string().trim().refine(value => !value ||
  (URL.canParse(value) && ["http:", "https:"].includes(new URL(value).protocol)),
  "Enter an http:// or https:// FDVU documentation link.");
export const assetUploadDetailsSchema = z.object({
  name: z.string().trim().min(1, "Enter an asset name."),
  ifcClass: z.string().trim(),
  system: z.string().trim(),
  fdvuDocumentationUrl: fdvuDocumentationUrlSchema,
  categoryId: id.optional(),
});
export type AssetUploadDetails = z.infer<typeof assetUploadDetailsSchema>;
export const editableDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  fdvuDocumentationUrl: fdvuDocumentationUrlSchema.optional(),
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
  analysisVersion: z.union([z.literal(2), z.literal(3)]).optional(),
  id,
  modelId: id,
  fingerprint: id,
  sourceName: z.string(),
  revision: z.number().int().positive(),
  current: z.boolean(),
  observation: sourceTypeObservationSchema,
});
export type SourceRecord = z.infer<typeof sourceRecordSchema>;
export const geometryReferenceSchema = z.union([z.object({ kind: z.literal("mesh"), geometryId: z.uuid() }), z.object({
  modelId: z.uuid(),
  fingerprint: id,
  candidateKey: id,
  occurrenceId: z.number().int().positive(),
})]);
export const libraryEntrySchema = z.object({
  id,
  definition: editableDefinitionSchema,
  status: z.enum(["draft", "approved", "archived"]),
  sourceReferences: z.array(sourceReferenceSchema),
  reviewFlags: z.array(z.enum(["source-changed"])),
  geometryReference: geometryReferenceSchema.optional(),
  publication: z
    .object({
      specifications: z.record(z.string(), normalizedValueSchema),
      labels: z.record(z.string(), z.string()),
    })
    .optional(),
});
export type LibraryEntry = z.infer<typeof libraryEntrySchema>;
export const catalogLibrarySchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  categories: z.array(catalogCategorySchema),
  templates: z.array(categoryTemplateSchema),
  sources: z.array(sourceRecordSchema),
  entries: z.array(libraryEntrySchema),
  excludedSourceParameterNames: z.array(z.string().trim().min(1)).optional(),
});
export type CatalogLibrary = z.infer<typeof catalogLibrarySchema>;
const expectedRevision = z.number().int().nonnegative();
export const sourceRebindingSchema = z.object({
  sourceId: id,
  fromFingerprint: id,
  toFingerprint: id,
  occurrenceIds: occurrenceIds.min(1),
});
export type SourceRebinding = z.infer<typeof sourceRebindingSchema>;
export const libraryCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create-asset"),
    expectedRevision,
    name: z.string().trim().min(1),
    details: assetUploadDetailsSchema.optional(),
    geometryReference: geometryReferenceSchema,
  }),
  z.object({
    kind: z.literal("update-geometry"),
    expectedRevision,
    entryId: id,
    geometryReference: geometryReferenceSchema,
  }),
  z.object({
    kind: z.literal("import-asset"),
    expectedRevision,
    snapshot: librarySnapshotSchema,
    candidateKey: id,
    details: assetUploadDetailsSchema.optional(),
  }),
  z.object({
    kind: z.literal("import-selected"),
    expectedRevision,
    snapshot: librarySnapshotSchema,
    candidateKeys: z.array(id).min(1).refine(keys => new Set(keys).size === keys.length, "Candidate keys must be unique."),
  }),
  z.object({
    kind: z.literal("exclude-source-parameters"),
    expectedRevision,
    names: z.array(z.string().trim().min(1)).min(1),
  }),
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
    sourceRebindings: z.array(sourceRebindingSchema).optional(),
  }),
  z.object({
    kind: z.literal("approve"),
    expectedRevision,
    entryIds: z.array(id).min(1),
    resolveConflictsAsUnknown: z.literal(true).optional(),
  }),
  ...(["archive", "restore"] as const).map((kind) =>
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
    uploadMappings: uploadMappingsSchema.optional(),
    ifcClass: catalogCategorySchema.shape.ifcClass,
    system: catalogCategorySchema.shape.system,
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
