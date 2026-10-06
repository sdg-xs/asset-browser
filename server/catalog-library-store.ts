import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ZodError } from "zod";
import {
  catalogLibrarySchema,
  libraryCommandSchema,
  type CatalogLibrary,
  type LibraryCommand,
  type LibrarySnapshot,
  type SourceReference,
} from "../shared/catalog-library.js";
import {
  applyLibraryCommand,
  CatalogDomainError,
  emptyCatalogLibrary,
} from "../shared/catalog-rules.js";
import type { LibraryModel } from "../shared/contracts.js";
import { LibraryError, LibraryStore } from "./library-store.js";

function missingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
function invalidSource(message: string): never {
  throw new LibraryError("INVALID_SOURCE_REFERENCE", message, 400);
}
function sameMembers(left: number[], right: number[]): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    left.every((id) => right.includes(id))
  );
}
function validateSnapshot(
  snapshot: LibrarySnapshot,
  model: LibraryModel,
): void {
  const index = model.index;
  if (!index) invalidSource("The source index is unavailable.");
  if (
    snapshot.sourceName !== model.name ||
    snapshot.types.length !== index.types.length ||
    new Set(snapshot.types.map((type) => type.typeGlobalId)).size !==
      snapshot.types.length
  )
    invalidSource("Import the complete analysis of the current source index.");
  for (const observation of snapshot.types) {
    const type = index.types.find(
      (type) => type.typeGlobalId === observation.typeGlobalId,
    );
    if (
      !type ||
      type.modelId !== model.id ||
      type.name !== observation.name ||
      type.ifcClass !== observation.ifcClass ||
      !sameMembers(observation.occurrenceIds, type.occurrenceIds) ||
      observation.categories.length !== type.categories.length ||
      new Set(observation.categories).size !== observation.categories.length ||
      !observation.categories.every((category) =>
        type.categories.includes(category),
      )
    )
      invalidSource(
        "Snapshot types, labels and occurrence memberships must match the current source index.",
      );
  }
}
function validateReferences(
  state: CatalogLibrary,
  references: SourceReference[],
  models: LibraryModel[],
): void {
  for (const reference of references) {
    const source = state.sources.find(
      (source) => source.id === reference.sourceId,
    );
    const model = models.find((model) => model.id === source?.modelId);
    const type = model?.index?.types.find(
      (type) => type.typeGlobalId === source?.observation.typeGlobalId,
    );
    if (
      !source ||
      !source.current ||
      source.fingerprint !== reference.fingerprint ||
      !type ||
      type.modelId !== source.modelId ||
      !sameMembers(source.observation.occurrenceIds, type.occurrenceIds) ||
      reference.occurrenceIds.some((id) => !type.occurrenceIds.includes(id))
    )
      invalidSource(
        "Confirmed geometry references must identify current indexed type occurrences.",
      );
  }
}

export class CatalogLibraryStore {
  private state: CatalogLibrary = emptyCatalogLibrary();
  private queue: Promise<unknown> = Promise.resolve();
  private constructor(
    private readonly dataRoot: string,
    private readonly models?: LibraryStore,
  ) {}
  static async create(options: {
    dataRoot: string;
    models?: LibraryStore;
  }): Promise<CatalogLibraryStore> {
    const store = new CatalogLibraryStore(
      resolve(options.dataRoot),
      options.models,
    );
    await mkdir(store.dataRoot, { recursive: true });
    try {
      const raw: unknown = JSON.parse(
        await readFile(join(store.dataRoot, "catalog-library.json"), "utf8"),
      );
      store.state = catalogLibrarySchema.parse(raw);
    } catch (error) {
      if (!missingFile(error)) {
        if (error instanceof SyntaxError || error instanceof ZodError)
          throw new LibraryError(
            "INVALID_CATALOG_STATE",
            "catalog-library.json is corrupt or uses an unsupported schema. Preserve the file and restore a valid backup before restarting the service.",
            500,
          );
        throw error;
      }
    }
    return store;
  }
  async read(): Promise<CatalogLibrary> {
    await this.queue;
    return structuredClone(this.state);
  }
  execute(input: LibraryCommand): Promise<CatalogLibrary> {
    const result = this.queue.then(async () => {
      const command = libraryCommandSchema.parse(input);
      if (command.expectedRevision !== this.state.revision)
        throw new CatalogDomainError(
          "REVISION_CONFLICT",
          "Catalog revision changed. Refresh the catalog and review your decision again.",
        );
      const publish = async () => {
        const next = applyLibraryCommand(this.state, command);
        if (next !== this.state) await this.commit(next);
        return structuredClone(this.state);
      };
      if (command.kind === "import") {
        return this.requireModels().withCurrentModels(
          [
            {
              modelId: command.snapshot.modelId,
              fingerprint: command.snapshot.fingerprint,
            },
          ],
          async (models) => {
            const model = models[0];
            if (!model) invalidSource("Source model is unavailable.");
            validateSnapshot(command.snapshot, model);
            return publish();
          },
        );
      }
      if (command.kind === "edit" && command.confirmedSourceReferences) {
        const references = command.confirmedSourceReferences;
        const requirements = references.map((reference) => {
          const source = this.state.sources.find(
            (source) => source.id === reference.sourceId,
          );
          if (!source) invalidSource("Source record does not exist.");
          return {
            modelId: source.modelId,
            fingerprint: reference.fingerprint,
          };
        });
        return this.requireModels().withCurrentModels(
          requirements,
          async (models) => {
            validateReferences(this.state, references, models);
            return publish();
          },
        );
      }
      return publish();
    });
    this.queue = result.catch(() => undefined);
    return result;
  }
  private requireModels(): LibraryStore {
    if (!this.models)
      throw new LibraryError(
        "SOURCE_VALIDATION_REQUIRED",
        "Connect the original model store before importing or confirming source references.",
        500,
      );
    return this.models;
  }
  private async commit(state: CatalogLibrary): Promise<void> {
    const temporary = join(
      this.dataRoot,
      `catalog-library.${randomUUID()}.tmp`,
    );
    try {
      await writeFile(temporary, JSON.stringify(state, null, 2), {
        flag: "wx",
      });
      await rename(temporary, join(this.dataRoot, "catalog-library.json"));
      this.state = state;
    } finally {
      await unlink(temporary).catch((error) => {
        if (!missingFile(error)) throw error;
      });
    }
  }
}
