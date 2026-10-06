// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { IfcWorkerClient } from "../src/ifc/client.js";
import { RequestSchema, ResponseSchema } from "../src/ifc/protocol.js";
import { CreationIndexSchema } from "../shared/asset-creation.js";
import { libraryApi } from "../src/library/api.js";
import type { LibraryModel } from "../shared/contracts.js";

const model: LibraryModel = { id: "b3907523-463f-414b-8235-1d5e1cce0454", fingerprint: "fixture", name: "Fixture.ifc", source: "upload", size: 1, modifiedAt: "2026-10-06T00:00:00Z", index: null };
const index = { schemaVersion: 1, modelId: model.id, fingerprint: model.fingerprint, candidates: [], stats: { elements: 0, candidates: 0, classified: 0, unclassified: 0, untyped: 0 } };
let client: IfcWorkerClient | undefined;
afterEach(() => { client?.dispose(); vi.unstubAllGlobals(); });

function transport(response: unknown = index) {
  const openings: string[] = [];
  class WorkerTransport {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    terminate() {}
    postMessage(raw: unknown) {
      const request = RequestSchema.parse(raw);
      if (request.kind === "open") {
        openings.push(request.purpose ?? "browse");
        this.onmessage?.({ data: { kind: "index", requestId: request.requestId, value: { schemaVersion: 1, modelId: model.id, fingerprint: model.fingerprint, types: [], stats: { elements: 0, classified: 0, excluded: 0, untyped: 0 } } } });
      } else if (request.kind === "discover") {
        this.onmessage?.({ data: { kind: "progress", requestId: request.requestId, message: "Discovering" } });
        this.onmessage?.({ data: { kind: "creation-index", requestId: request.requestId, value: response } });
      }
    }
  }
  vi.stubGlobal("Worker", WorkerTransport);
  client = new IfcWorkerClient();
  return { client, openings };
}

it("reopens when switching opening purpose and delivers discovery progress", async () => {
  const { client, openings } = transport();
  await client.openModel({ model, fileUrl: "/api/models/source/file" });
  await client.openModel({ model, fileUrl: "/api/models/source/file", purpose: "creation" });
  const messages: string[] = [];
  expect(await client.discoverAssets({ modelId: model.id, onProgress: message => messages.push(message) })).toEqual(index);
  expect(messages).toEqual(["Discovering"]);
  await client.openModel({ model, fileUrl: "/api/models/source/file", purpose: "creation" });
  await client.openModel({ model, fileUrl: "/api/models/source/file" });
  expect(openings).toEqual(["browse", "creation", "browse"]);
});

it.each([
  { ...index, modelId: "00000000-0000-4000-8000-000000000000" },
  { ...index, fingerprint: "other-revision" },
])("rejects creation worker responses from another source or revision", async response => {
  const { client } = transport(response);
  await client.openModel({ model, fileUrl: "/api/models/source/file", purpose: "creation" });
  await expect(client.discoverAssets({ modelId: model.id })).rejects.toThrow(/source|revision|model/i);
});

it("rejects malformed creation membership at the transport schema", () => {
  const invalid = { ...index, candidates: [{ key: "element:one", identity: { kind: "element", globalId: "one" }, name: "One", ifcClass: "IFCPROXY", categories: [], classificationIssues: [], occurrenceIds: [1], representativeId: 2 }] };
  expect(CreationIndexSchema.safeParse(invalid).success).toBe(false);
  expect(ResponseSchema.safeParse({ kind: "creation-index", requestId: 1, value: invalid }).success).toBe(false);
});

it("validates and returns the saved creation index over the source API", async () => {
  vi.stubGlobal("fetch", async (url: string, options: RequestInit) => {
    expect(url).toBe(`/api/models/${model.id}/creation-index`);
    expect(options.method).toBe("PUT");
    expect(JSON.parse(String(options.body))).toEqual(index);
    return new Response(JSON.stringify(index), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  expect(await libraryApi.saveCreationIndex(CreationIndexSchema.parse(index))).toEqual(index);
});
