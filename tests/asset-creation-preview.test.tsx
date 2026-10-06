// @vitest-environment jsdom
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { applyLibraryCommand, emptyCatalogLibrary } from "../shared/catalog-rules.js";
import type { LibrarySnapshot } from "../shared/catalog-library.js";
import type { CreationIndex } from "../shared/asset-creation.js";
import type { LibraryModel, PreviewGeometry } from "../shared/contracts.js";
import { geometrySource, useDefinitionPreview } from "../src/catalog/useDefinitionPreview.js";
import { AssetInspector } from "../src/components/AssetInspector.js";
import type { LibraryApi } from "../src/library/api.js";
import type { LibraryWorker } from "../src/library/useLibrary.js";

afterEach(cleanup);
function fixture(kind: "type" | "element" = "element") {
  const index: CreationIndex = { schemaVersion: 1, modelId: "model", fingerprint: "v1", candidates: [{ key: `${kind}:one`, identity: { kind, globalId: "one" }, name: "Sensor", ifcClass: "IFCPROXY", categories: ["Sensors"], classificationIssues: [], occurrenceIds: [1], representativeId: 1 }], stats: { elements: 1, candidates: 1, classified: 1, unclassified: 0, untyped: kind === "element" ? 1 : 0 } };
  const observation = { name: "Sensor", ifcClass: "IFCPROXY", categories: ["Sensors"], occurrenceIds: [1], fields: [] };
  const snapshot: LibrarySnapshot = { analysisVersion: 3, modelId: "model", fingerprint: "v1", sourceName: "Sensor.ifc", types: [kind === "type" ? { ...observation, typeGlobalId: "one" } : { ...observation, typeGlobalId: null, elementGlobalId: "one" }] };
  const state = applyLibraryCommand(emptyCatalogLibrary(), { kind: "import-selected", expectedRevision: 0, snapshot, candidateKeys: [`${kind}:one`] });
  const entry = state.entries[0];
  if (!entry) throw Error("Missing entry");
  const model: LibraryModel = { id: "model", fingerprint: "v1", name: "Sensor.ifc", source: "upload", size: 1, modifiedAt: "2026-10-06T00:00:00Z", index: { schemaVersion: 1, modelId: "model", fingerprint: "v1", types: [], stats: { elements: 1, classified: 0, excluded: 1, untyped: 1 } }, creationIndex: index };
  const api: LibraryApi = { list: vi.fn(async () => [model]), saveIndex: vi.fn(), saveCreationIndex: vi.fn(), hide: vi.fn(), upload: vi.fn() };
  const geometry: PreviewGeometry = { meshes: [{ positions: new Float32Array([0, 0, 0]), normals: new Float32Array([0, 0, 1]), indices: new Uint32Array([0]), transform: Array.from({ length: 16 }, (_, i) => i % 5 === 0 ? 1 : 0), color: [1, 1, 1, 1] }] };
  const worker: LibraryWorker = { openModel: vi.fn(async () => { if (!model.index) throw Error("No browse index"); return model.index; }), discoverAssets: vi.fn(async () => index), readProperties: vi.fn(async () => []), readGeometry: vi.fn(async () => geometry), dispose: vi.fn() };
  return { state, entry, model, index, api, worker };
}
it("opens an element in creation mode, reads only its saved occurrence, and labels its raw identity", async () => {
  const f = fixture();
  const createWorker = () => f.worker;
  const hook = renderHook(() => useDefinitionPreview(f.state, f.entry, f.api, createWorker));
  await waitFor(() => expect(hook.result.current.inspection.kind).toBe("ready"));
  expect(f.worker.openModel).toHaveBeenCalledWith(expect.objectContaining({ purpose: "creation" }));
  expect(f.worker.discoverAssets).toHaveBeenCalledWith({ modelId: "model" });
  expect(f.worker.readGeometry).toHaveBeenCalledTimes(1);
  expect(f.worker.readGeometry).toHaveBeenCalledWith({ modelId: "model", elementId: 1 });
  const inspection = hook.result.current.inspection;
  if (inspection.kind !== "ready") throw Error("Missing ready preview");
  expect(inspection.asset).toMatchObject({ typeGlobalId: null, elementGlobalId: "one" });
  render(<AssetInspector inspection={{ ...inspection, geometry: null }} onClose={() => {}} onRetry={() => {}} />);
  expect(screen.getByText("Element identity")).toBeTruthy();
  expect(screen.queryByText("Type identity")).toBeNull();
  expect(screen.getByText("one")).toBeTruthy();
});
it.each(["identity", "membership", "revision"])("blocks changed fresh element %s before reading geometry", async change => {
  const f = fixture();
  const changed = structuredClone(f.index);
  const candidate = changed.candidates[0];
  if (!candidate) throw Error("Missing candidate");
  if (change === "identity") { candidate.identity.globalId = "other"; candidate.key = "element:other"; }
  if (change === "membership") { candidate.occurrenceIds = [2]; candidate.representativeId = 2; }
  if (change === "revision") changed.fingerprint = "v2";
  f.worker.discoverAssets = vi.fn(async () => changed);
  const createWorker = () => f.worker;
  const hook = renderHook(() => useDefinitionPreview(f.state, f.entry, f.api, createWorker));
  await waitFor(() => expect(hook.result.current.message).toMatch(/Source changed/));
  expect(f.worker.readGeometry).not.toHaveBeenCalled();
});
it("requires a current creation index for creation observations even if a browse type exists", () => {
  const f = fixture("type");
  const reference = f.entry.sourceReferences[0];
  if (!reference || !f.model.index) throw Error("Missing fixture");
  f.model.index.types.push({ id: "type", modelId: "model", typeGlobalId: "one", name: "Sensor", ifcClass: "IFCPROXY", categories: ["Sensors"], occurrenceIds: [1], representativeId: 1 });
  delete f.model.creationIndex;
  expect(geometrySource(f.state, reference, [f.model])).toBeNull();
});
it("blocks an unselected occurrence before opening the worker", async () => {
  const f = fixture();
  const reference = f.entry.sourceReferences[0];
  if (!reference) throw Error("Missing reference");
  reference.occurrenceIds = [2];
  const createWorker = () => f.worker;
  const hook = renderHook(() => useDefinitionPreview(f.state, f.entry, f.api, createWorker));
  await waitFor(() => expect(hook.result.current.message).toMatch(/No current geometry source/));
  expect(f.worker.openModel).not.toHaveBeenCalled();
  expect(f.worker.readGeometry).not.toHaveBeenCalled();
});
