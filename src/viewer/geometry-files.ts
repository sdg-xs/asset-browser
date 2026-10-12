import { meshFormatSchema, type MeshFormat } from "../../shared/mesh-geometry.js";

export const geometryFileAccept = ".ifc,.glb,.gltf,.obj,.stl,.bin,.mtl";
export const geometryFileTypes = "IFC, GLB, glTF, OBJ and STL";
export function meshFormat(name: string): MeshFormat | null {
  return meshFormatSchema.safeParse(name.split(".").pop()?.toLowerCase()).data ?? null;
}
