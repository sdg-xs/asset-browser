import { z } from "zod";
import type { PreviewGeometry } from "./contracts.js";

export const meshFormatSchema = z.enum(["glb", "gltf", "obj", "stl"]);
export type MeshFormat = z.infer<typeof meshFormatSchema>;
export const geometryUploadSchema = z.object({
  name: z.string().trim().min(1),
  format: meshFormatSchema,
  geometry: z.object({ meshes: z.array(z.object({
    positions: z.array(z.number().finite()).min(9),
    normals: z.array(z.number().finite()),
    indices: z.array(z.number().int().nonnegative()).min(3),
    transform: z.array(z.number().finite()).length(16),
    color: z.array(z.number().finite().min(0).max(1)).length(4),
  }).superRefine((mesh, context) => {
    if (mesh.positions.length % 3 || mesh.normals.length !== mesh.positions.length || mesh.indices.length % 3 ||
        mesh.indices.some(index => index >= mesh.positions.length / 3))
      context.addIssue({ code: "custom", message: "Mesh vertices, normals and triangle indices must match." });
  })).min(1) }),
});
export type GeometryUpload = z.infer<typeof geometryUploadSchema>;
export const geometryRecordSchema = geometryUploadSchema.extend({ id: z.uuid() });
export type GeometryRecord = z.infer<typeof geometryRecordSchema>;
export function encodeGeometry(geometry: PreviewGeometry): GeometryUpload["geometry"] {
  return { meshes: geometry.meshes.map(mesh => ({ ...mesh,
    positions: Array.from(mesh.positions), normals: Array.from(mesh.normals), indices: Array.from(mesh.indices),
  })) };
}
export function decodeGeometry(geometry: GeometryUpload["geometry"]): PreviewGeometry {
  return { meshes: geometry.meshes.map(mesh => ({ ...mesh,
    positions: new Float32Array(mesh.positions), normals: new Float32Array(mesh.normals), indices: new Uint32Array(mesh.indices),
  })) };
}
