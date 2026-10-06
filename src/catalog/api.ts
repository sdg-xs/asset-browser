import { ApiErrorSchema } from "../../shared/contracts.js";
import {
  catalogLibrarySchema,
  type CatalogLibrary,
  type LibraryCommand,
} from "../../shared/catalog-library.js";
export class CatalogRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export interface CatalogApi {
  read(): Promise<CatalogLibrary>;
  execute(command: LibraryCommand): Promise<CatalogLibrary>;
}
async function readResponse(response: Response) {
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = ApiErrorSchema.safeParse(body).data?.error;
    throw new CatalogRequestError(
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? "Catalog request failed.",
    );
  }
  return catalogLibrarySchema.parse(body);
}
export const catalogApi: CatalogApi = {
  read: async () => readResponse(await fetch("/api/catalog-library")),
  execute: async (command) =>
    readResponse(
      await fetch("/api/catalog-library/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      }),
    ),
};
export type CatalogAction = LibraryCommand extends infer Command
  ? Command extends LibraryCommand
    ? Omit<Command, "expectedRevision">
    : never
  : never;
