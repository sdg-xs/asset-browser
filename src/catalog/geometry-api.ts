import { geometryRecordSchema, type GeometryRecord, type GeometryUpload } from "../../shared/mesh-geometry.js";
import { ApiErrorSchema } from "../../shared/contracts.js";
export interface GeometryApi {
  save(input: GeometryUpload): Promise<GeometryRecord>;
  read(id: string): Promise<GeometryRecord>;
}
async function record(response: Response) {
  const body: unknown = await response.json();
  if (!response.ok) throw Error(ApiErrorSchema.safeParse(body).data?.error.message ?? "Geometry request failed.");
  return geometryRecordSchema.parse(body);
}
export const geometryApi: GeometryApi = {
  save: async input => record(await fetch("/api/geometry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })),
  read: async id => record(await fetch(`/api/geometry/${encodeURIComponent(id)}`)),
};
