import { z } from 'zod';
import { CatalogIndexSchema, LibraryModelSchema, ModelIdSchema, PreviewGeometrySchema, PropertyGroupSchema } from '../../shared/contracts.js';

export const RequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('open'), requestId: z.int(), model: LibraryModelSchema, fileUrl: z.string().url(), wasmPath: z.string().url() }),
  z.object({ kind: z.literal('properties'), requestId: z.int(), modelId: ModelIdSchema, elementId: z.int().positive() }),
  z.object({ kind: z.literal('geometry'), requestId: z.int(), modelId: ModelIdSchema, elementId: z.int().positive() }),
]);
export type WorkerRequest = z.infer<typeof RequestSchema>;
export const ResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('progress'), requestId: z.int(), message: z.string() }),
  z.object({ kind: z.literal('error'), requestId: z.int(), message: z.string(), code: z.enum(['SOURCE_CHANGED', 'IFC_ERROR']) }),
  z.object({ kind: z.literal('index'), requestId: z.int(), value: CatalogIndexSchema }),
  z.object({ kind: z.literal('properties'), requestId: z.int(), value: z.array(PropertyGroupSchema) }),
  z.object({ kind: z.literal('geometry'), requestId: z.int(), value: PreviewGeometrySchema }),
]);
export type WorkerResponse = z.infer<typeof ResponseSchema>;
