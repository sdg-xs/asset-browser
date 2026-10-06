import type express from "express";
import { libraryCommandSchema } from "../shared/catalog-library.js";
import { CatalogDomainError } from "../shared/catalog-rules.js";
import { LibraryError, type LibraryStore } from "./library-store.js";
import { CatalogLibraryStore } from "./catalog-library-store.js";

export async function mountCatalogLibraryRoutes(
  app: express.Express,
  models: LibraryStore,
  dataRoot: string,
): Promise<void> {
  const store = await CatalogLibraryStore.create({ dataRoot, models });
  app.get("/api/catalog-library", async (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json(await store.read());
  });
  app.post("/api/catalog-library/commands", async (request, response) => {
    const raw: unknown = request.body;
    const command = libraryCommandSchema.parse(raw);
    try {
      response.setHeader("Cache-Control", "no-store");
      response.json(await store.execute(command));
    } catch (error) {
      if (error instanceof CatalogDomainError)
        throw new LibraryError(
          error.code,
          [error.message, ...error.issues].join(" "),
          error.code === "REVISION_CONFLICT"
            ? 409
            : error.code === "NOT_FOUND"
              ? 404
              : 400,
        );
      throw error;
    }
  });
}
