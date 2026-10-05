import {
  ApiErrorSchema,
  CatalogIndexSchema,
  LibraryModelSchema,
  LibraryModelsSchema,
  type CatalogIndex,
  type LibraryModel,
} from "../../shared/contracts.js";

async function responseData(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      ApiErrorSchema.safeParse(body).data?.error.message ??
        `Library request failed (${response.status}).`,
    );
  return body;
}
export interface LibraryApi {
  list(): Promise<LibraryModel[]>;
  saveIndex(index: CatalogIndex): Promise<CatalogIndex>;
  hide(id: string): Promise<void>;
  upload(
    file: File,
    onProgress: (percent: number) => void,
  ): Promise<LibraryModel>;
}
export const libraryApi: LibraryApi = {
  async list() {
    return LibraryModelsSchema.parse(
      await responseData(await fetch("/api/models")),
    );
  },
  async saveIndex(index) {
    return CatalogIndexSchema.parse(
      LibraryModelSchema.parse(
        await responseData(
          await fetch(`/api/models/${index.modelId}/index`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(index),
          }),
        ),
      ).index,
    );
  },
  async hide(id) {
    await responseData(await fetch(`/api/models/${id}`, { method: "DELETE" }));
  },
  upload(file, onProgress) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", "/api/models");
      request.responseType = "json";
      request.upload.onprogress = (event) => {
        if (event.lengthComputable)
          onProgress(Math.round((event.loaded / event.total) * 100));
      };
      request.onerror = () =>
        reject(
          new Error(
            "Upload could not reach the local library. Check the service and try again.",
          ),
        );
      request.onload = () => {
        const body: unknown = request.response;
        if (request.status < 200 || request.status >= 300) {
          reject(
            new Error(
              ApiErrorSchema.safeParse(body).data?.error.message ??
                "Upload failed.",
            ),
          );
          return;
        }
        const parsed = LibraryModelSchema.safeParse(body);
        if (parsed.success) resolve(parsed.data);
        else
          reject(new Error("The library returned an invalid upload record."));
      };
      const body = new FormData();
      body.append("file", file);
      request.send(body);
    });
  },
};
