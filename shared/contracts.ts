import { z } from "zod";

export const ModelIdSchema = z.uuid();
export const AssetTypeSchema = z.object({
  id: z.string().min(1),
  modelId: ModelIdSchema,
  typeGlobalId: z.string().min(1),
  name: z.string(),
  ifcClass: z.string().min(1),
  categories: z.array(z.string().min(1)),
  occurrenceIds: z.array(z.int().positive()),
  representativeId: z.int().positive(),
});
export type AssetType = z.infer<typeof AssetTypeSchema>;

export const CatalogIndexSchema = z.object({
  schemaVersion: z.literal(1),
  modelId: ModelIdSchema,
  fingerprint: z.string().min(1),
  types: z.array(AssetTypeSchema),
  stats: z.object({
    elements: z.int().nonnegative(),
    classified: z.int().nonnegative(),
    excluded: z.int().nonnegative(),
    untyped: z.int().nonnegative(),
  }),
});
export type CatalogIndex = z.infer<typeof CatalogIndexSchema>;

export const LibraryModelSchema = z.object({
  id: ModelIdSchema,
  name: z.string().min(1),
  source: z.enum(["existing", "upload"]),
  size: z.int().nonnegative(),
  modifiedAt: z.iso.datetime(),
  fingerprint: z.string().min(1),
  index: CatalogIndexSchema.nullable(),
});
export type LibraryModel = z.infer<typeof LibraryModelSchema>;
export const LibraryModelsSchema = z.array(LibraryModelSchema);

export const PropertyGroupSchema = z.object({
  name: z.string(),
  source: z.enum(["instance", "type"]),
  values: z.array(z.object({ name: z.string(), value: z.string() })),
});
export type PropertyGroup = z.infer<typeof PropertyGroupSchema>;

export const PreviewGeometrySchema = z.object({
  meshes: z.array(
    z.object({
      positions: z.instanceof(Float32Array),
      normals: z.instanceof(Float32Array),
      indices: z.instanceof(Uint32Array),
      transform: z.array(z.number().finite()).length(16),
      color: z.array(z.number().finite()).length(4),
    }),
  ),
});
export type PreviewGeometry = z.infer<typeof PreviewGeometrySchema>;

export const ApiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
export const HealthSchema = z.object({ status: z.literal("ok") });
