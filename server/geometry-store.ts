import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { geometryRecordSchema, geometryUploadSchema, type GeometryUpload } from "../shared/mesh-geometry.js";
import { LibraryError } from "./library-store.js";
import { replaceFile } from "./replace-file.js";

export class GeometryStore {
  constructor(private readonly dataRoot: string) {}
  async save(input: GeometryUpload) {
    const record = geometryRecordSchema.parse({ ...geometryUploadSchema.parse(input), id: randomUUID() });
    const directory = join(this.dataRoot, "geometry");
    await mkdir(directory, { recursive: true });
    const temporary = join(directory, `${record.id}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(record), { flag: "wx" });
      await replaceFile({ temporary, destination: join(directory, `${record.id}.json`) });
    } finally { await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
    return record;
  }
  async read(id: string) {
    const validId = z.uuid().parse(id);
    try {
      const raw: unknown = JSON.parse(await readFile(join(this.dataRoot, "geometry", `${validId}.json`), "utf8"));
      return geometryRecordSchema.parse(raw);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        throw new LibraryError("GEOMETRY_NOT_FOUND", "The saved geometry is unavailable. Upload a new model.", 404);
      throw error;
    }
  }
}
