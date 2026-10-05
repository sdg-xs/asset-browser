import { randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { z } from "zod";
import {
  CatalogIndexSchema,
  LibraryModelSchema,
  ModelIdSchema,
  type CatalogIndex,
  type LibraryModel,
} from "../shared/contracts.js";
import { DEFAULT_MAX_UPLOAD_BYTES } from "./config.js";

const StoreOptionsSchema = z.object({
  sourceRoot: z.string().min(1),
  dataRoot: z.string().min(1),
  maxUploadBytes: z.int().positive().default(DEFAULT_MAX_UPLOAD_BYTES),
});
export type StoreOptions = z.input<typeof StoreOptionsSchema>;
const EntrySchema = z.object({
  model: LibraryModelSchema,
  path: z.string().min(1),
  hidden: z.boolean(),
});
const StateSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(EntrySchema),
});
type Entry = z.infer<typeof EntrySchema>;
type State = z.infer<typeof StateSchema>;

export class LibraryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "LibraryError";
  }
}
function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
function isWithin(root: string, path: string): boolean {
  const local = relative(root, path);
  return (
    local !== "" &&
    local !== ".." &&
    !local.startsWith(`..${sep}`) &&
    !isAbsolute(local)
  );
}

export class LibraryStore {
  private state: State = { schemaVersion: 1, entries: [] };
  private queue: Promise<unknown> = Promise.resolve();
  private readonly sourceRoot: string;
  private readonly dataRoot: string;
  private readonly maxUploadBytes: number;
  private constructor(options: z.output<typeof StoreOptionsSchema>) {
    this.sourceRoot = resolve(options.sourceRoot);
    this.dataRoot = resolve(options.dataRoot);
    this.maxUploadBytes = options.maxUploadBytes;
  }
  static async create(options: StoreOptions): Promise<LibraryStore> {
    const store = new LibraryStore(StoreOptionsSchema.parse(options));
    if (
      store.sourceRoot === store.dataRoot ||
      isWithin(store.dataRoot, store.sourceRoot) ||
      isWithin(store.sourceRoot, store.dataRoot)
    ) {
      throw new LibraryError(
        "INVALID_CONFIG",
        "Keep the existing source root and managed data directory separate.",
        500,
      );
    }
    await mkdir(join(store.dataRoot, "uploads"), { recursive: true });
    await mkdir(join(store.dataRoot, "staging"), { recursive: true });
    try {
      const raw: unknown = JSON.parse(
        await readFile(join(store.dataRoot, "library.json"), "utf8"),
      );
      store.state = StateSchema.parse(raw);
      for (const entry of store.state.entries) {
        const root =
          entry.model.source === "existing"
            ? store.sourceRoot
            : join(store.dataRoot, "uploads");
        if (!isWithin(root, resolve(entry.path)))
          throw new LibraryError(
            "INVALID_STATE",
            "A persisted model path is outside its configured root.",
            500,
          );
      }
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
    }
    return store;
  }
  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async commit(entries: Entry[]): Promise<void> {
    const state: State = { schemaVersion: 1, entries };
    const temporary = join(this.dataRoot, `library.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(state, null, 2), {
        flag: "wx",
      });
      await rename(temporary, join(this.dataRoot, "library.json"));
      this.state = state;
    } finally {
      await unlink(temporary).catch((error) => {
        if (!hasCode(error, "ENOENT")) throw error;
      });
    }
  }
  private async discover(): Promise<string[]> {
    let properties;
    try {
      properties = await readdir(this.sourceRoot, { withFileTypes: true });
    } catch (error) {
      if (hasCode(error, "ENOENT")) return [];
      throw error;
    }
    const files: string[] = [];
    for (const property of properties) {
      if (!property.isDirectory()) continue;
      const ifcRoot = join(this.sourceRoot, property.name, "IFC");
      let models;
      try {
        models = await readdir(ifcRoot, { withFileTypes: true });
      } catch (error) {
        if (hasCode(error, "ENOENT")) continue;
        throw error;
      }
      for (const model of models) {
        if (model.isFile() && extname(model.name).toLowerCase() === ".ifc")
          files.push(join(ifcRoot, model.name));
      }
    }
    return files.sort();
  }
  private async refresh(): Promise<Entry[]> {
    const entries = this.state.entries.map((entry) => ({
      ...entry,
      model: { ...entry.model },
    }));
    for (const path of await this.discover()) {
      if (!entries.some((entry) => entry.path === path))
        entries.push({
          path,
          hidden: false,
          model: {
            id: randomUUID(),
            name: basename(path),
            source: "existing",
            size: 0,
            modifiedAt: new Date(0).toISOString(),
            fingerprint: "pending",
            index: null,
          },
        });
    }
    const available: Entry[] = [];
    for (const entry of entries) {
      let info;
      try {
        info = await stat(entry.path);
      } catch (error) {
        if (hasCode(error, "ENOENT")) continue;
        throw error;
      }
      if (!info.isFile()) continue;
      const fingerprint = `${info.size}:${info.mtimeMs}`;
      if (entry.model.fingerprint !== fingerprint)
        entry.model = {
          ...entry.model,
          size: info.size,
          modifiedAt: info.mtime.toISOString(),
          fingerprint,
          index: null,
        };
      if (!entry.hidden) available.push(entry);
    }
    if (JSON.stringify(entries) !== JSON.stringify(this.state.entries))
      await this.commit(entries);
    return available;
  }
  private async findVisible(id: string): Promise<Entry> {
    const parsed = ModelIdSchema.safeParse(id);
    if (!parsed.success)
      throw new LibraryError(
        "INVALID_MODEL_ID",
        "Use a valid library model ID.",
        400,
      );
    const entry = (await this.refresh()).find(
      (item) => item.model.id === parsed.data,
    );
    if (!entry)
      throw new LibraryError(
        "MODEL_NOT_FOUND",
        "This model is unavailable or has been removed from the library.",
        404,
      );
    return entry;
  }
  listModels(): Promise<LibraryModel[]> {
    return this.serialized(async () =>
      (await this.refresh()).map((entry) =>
        LibraryModelSchema.parse(entry.model),
      ),
    );
  }
  hideModel(id: string): Promise<void> {
    return this.serialized(async () => {
      await this.findVisible(id);
      await this.commit(
        this.state.entries.map((entry) =>
          entry.model.id === id ? { ...entry, hidden: true } : entry,
        ),
      );
    });
  }
  saveIndex(id: string, rawIndex: CatalogIndex): Promise<LibraryModel> {
    return this.serialized(async () => {
      const index = CatalogIndexSchema.parse(rawIndex);
      const entry = await this.findVisible(id);
      if (
        index.modelId !== id ||
        index.types.some((type) => type.modelId !== id)
      )
        throw new LibraryError(
          "INVALID_INDEX",
          "The index and its types must belong to this model.",
          400,
        );
      if (index.fingerprint !== entry.model.fingerprint)
        throw new LibraryError(
          "STALE_INDEX",
          "The source file changed. Index the current revision again.",
          409,
        );
      const model = { ...entry.model, index };
      await this.commit(
        this.state.entries.map((item) =>
          item.model.id === id ? { ...item, model } : item,
        ),
      );
      return LibraryModelSchema.parse(model);
    });
  }
  resolveModelFile(id: string): Promise<string> {
    return this.serialized(async () => (await this.findVisible(id)).path);
  }
  async createUploadDestination(): Promise<string> {
    return join(this.dataRoot, "staging", `${randomUUID()}.tmp`);
  }
  private async validateIfc(path: string): Promise<void> {
    const file = await open(path, "r");
    try {
      const info = await file.stat();
      if (info.size > this.maxUploadBytes)
        throw new LibraryError(
          "UPLOAD_TOO_LARGE",
          `Upload exceeds the ${this.maxUploadBytes}-byte limit.`,
          413,
        );
      const header = Buffer.alloc(Math.min(info.size, 64 * 1024));
      await file.read(header, 0, header.length, 0);
      const text = header
        .toString("utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\uFEFF/, "");
      const endHeader = text.indexOf("ENDSEC;");
      const section = text.slice(0, endHeader);
      const schema = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'\s*\)\s*\)\s*;/i.exec(
        section,
      )?.[1];
      const trailer = Buffer.alloc(Math.min(info.size, 1024));
      await file.read(trailer, 0, trailer.length, info.size - trailer.length);
      if (
        !/^\s*ISO-10303-21;\s*HEADER;/i.test(section) ||
        endHeader < 0 ||
        !/FILE_DESCRIPTION\s*\(/i.test(section) ||
        !/FILE_NAME\s*\(/i.test(section) ||
        !schema ||
        !/^IFC(?:2X3|4(?:X[123])?(?:_ADD[12])?)$/i.test(schema) ||
        !/^\s*DATA;/i.test(text.slice(endHeader + 7)) ||
        !/ENDSEC;\s*END-ISO-10303-21;\s*$/i.test(trailer.toString("utf8"))
      ) {
        throw new LibraryError(
          "INVALID_IFC",
          "Upload a complete STEP IFC file with an IFC schema header.",
          400,
        );
      }
    } finally {
      await file.close();
    }
  }
  persistUpload(upload: {
    temporaryPath: string;
    name: string;
  }): Promise<LibraryModel> {
    return this.serialized(async () => {
      const temporaryPath = resolve(upload.temporaryPath);
      if (
        dirname(temporaryPath) !== join(this.dataRoot, "staging") ||
        extname(temporaryPath) !== ".tmp"
      )
        throw new LibraryError(
          "INVALID_UPLOAD_PATH",
          "Upload must use the managed staging directory.",
          400,
        );
      const name = basename(upload.name.replaceAll("\\", "/")).trim();
      let finalPath: string | undefined;
      try {
        if (!name || extname(name).toLowerCase() !== ".ifc")
          throw new LibraryError(
            "INVALID_IFC",
            "Choose a file with the .ifc extension.",
            400,
          );
        await this.validateIfc(temporaryPath);
        const id = randomUUID();
        finalPath = join(this.dataRoot, "uploads", `${id}.ifc`);
        await rename(temporaryPath, finalPath);
        const info = await stat(finalPath);
        const model: LibraryModel = {
          id,
          name,
          source: "upload",
          size: info.size,
          modifiedAt: info.mtime.toISOString(),
          fingerprint: `${info.size}:${info.mtimeMs}`,
          index: null,
        };
        await this.commit([
          ...this.state.entries,
          { model, path: finalPath, hidden: false },
        ]);
        return model;
      } catch (error) {
        if (finalPath)
          await unlink(finalPath).catch((cleanupError) => {
            if (!hasCode(cleanupError, "ENOENT")) throw cleanupError;
          });
        throw error;
      } finally {
        await unlink(temporaryPath).catch((error) => {
          if (!hasCode(error, "ENOENT")) throw error;
        });
      }
    });
  }
}
