// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AssetCreationDialog } from "../src/catalog/AssetCreationDialog.js";
import { CatalogWorkspace } from "../src/catalog/CatalogWorkspace.js";
import type { CreationWorker } from "../src/catalog/useAssetCreation.js";
import type { CreationIndex } from "../shared/asset-creation.js";
import type { LibrarySnapshot } from "../shared/catalog-library.js";
import type { LibraryModel } from "../shared/contracts.js";
import type { LibraryApi } from "../src/library/api.js";
import { applyLibraryCommand, emptyCatalogLibrary } from "../shared/catalog-rules.js";
import { CatalogRequestError, type CatalogApi } from "../src/catalog/api.js";

afterEach(cleanup);
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
const model: LibraryModel = { id: "10000000-0000-4000-8000-000000000001", name: "Furniture.ifc", fingerprint: "v1", size: 10, source: "upload", modifiedAt: "2026-10-06T00:00:00.000Z", index: null };
function fixture(count = 2) {
  const candidates: CreationIndex["candidates"] = Array.from({ length: count }, (_, i) => ({
    key: `type:item${i}`, identity: { kind: "type", globalId: `item${i}` }, name: `Asset ${i + 1}`,
    ifcClass: "IFCFURNITURETYPE", categories: i === 1 ? [] : ["Furniture"], classificationIssues: [],
    occurrenceIds: [i + 1], representativeId: i + 1,
  }));
  const index: CreationIndex = { schemaVersion: 1, modelId: model.id, fingerprint: model.fingerprint, candidates,
    stats: { elements: count, candidates: count, classified: count - (count > 1 ? 1 : 0), unclassified: count > 1 ? 1 : 0, untyped: 0 } };
  const snapshot: LibrarySnapshot = { analysisVersion: 3, modelId: model.id, fingerprint: model.fingerprint, sourceName: model.name,
    types: candidates.map(c => ({ typeGlobalId: c.identity.globalId, name: c.name, ifcClass: c.ifcClass, categories: c.categories, occurrenceIds: c.occurrenceIds, fields: [] })) };
  const api: LibraryApi = { list: vi.fn(async () => []), upload: vi.fn(async () => model), saveCreationIndex: vi.fn(async value => value), saveIndex: vi.fn(), hide: vi.fn() };
  const worker: CreationWorker = { openModel: vi.fn(), discoverAssets: vi.fn(async () => index), analyzeAssets: vi.fn(async () => snapshot), dispose: vi.fn() };
  return { api, worker, index, snapshot };
}
function chooseFile(name = "Furniture.ifc") {
  fireEvent.change(screen.getByLabelText("IFC file"), { target: { files: [new File(["IFC"], name)] } });
  fireEvent.click(screen.getByRole("button", { name: "Analyze IFC" }));
}
describe("guided asset creation", () => {
  it("requires a fresh file after choosing another IFC", async () => {
    const f = fixture(1);
    render(<AssetCreationDialog sourceApi={f.api} revision={0} execute={vi.fn(async () => true)} createWorker={() => f.worker} onClose={vi.fn()} onSuccess={vi.fn()} />);
    chooseFile(); await screen.findByRole("checkbox", { name: "Select Asset 1" });
    fireEvent.click(screen.getByRole("button", { name: "Choose another IFC" }));
    expect(screen.queryByText("Furniture.ifc")).toBeNull();
    expect(screen.getByRole("button", { name: "Analyze IFC" })).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("IFC file")).toHaveProperty("value", "");
  });
  it("offers upload in empty and populated Library and returns focus on Escape", async () => {
    for (const populated of [false, true]) {
      const f = fixture(1);
      let state = populated ? applyLibraryCommand(emptyCatalogLibrary(), { kind: "import-selected", expectedRevision: 0, snapshot: f.snapshot, candidateKeys: ["type:item0"] }) : emptyCatalogLibrary();
      if (populated) state = applyLibraryCommand(state, { kind: "approve", expectedRevision: state.revision, entryIds: state.entries.map(e => e.id) });
      render(<CatalogWorkspace catalogApi={{ read: async () => state, execute: vi.fn() }} sourceApi={f.api} createCreationWorker={() => f.worker} />);
      const upload = (await screen.findAllByRole("button", { name: "Upload IFC" }))[0];
      if (!upload) throw Error("No upload action");
      upload.focus(); fireEvent.click(upload);
      const dialog = screen.getByRole("dialog", { name: "Create assets from IFC" });
      expect(within(dialog).getByLabelText("IFC file")).toBeTruthy();
      fireEvent(dialog, new Event("cancel", { cancelable: true }));
      expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(upload);
      cleanup();
    }
  });
  it("analyzes before import, keeps unclassified candidates unchecked, and submits selected keys", async () => {
    const f = fixture(); const execute = vi.fn(async () => true); const success = vi.fn();
    render(<AssetCreationDialog sourceApi={f.api} revision={7} execute={execute} createWorker={() => f.worker} onClose={vi.fn()} onSuccess={success} />);
    chooseFile();
    const first = await screen.findByRole("checkbox", { name: "Select Asset 1" });
    expect(first).toHaveProperty("checked", true);
    expect(screen.getByRole("checkbox", { name: "Select Asset 2" })).toHaveProperty("checked", false);
    expect(execute).not.toHaveBeenCalled(); expect(success).not.toHaveBeenCalled();
    expect(f.worker.openModel).toHaveBeenCalledWith(expect.objectContaining({ purpose: "creation" }));
    expect(f.api.saveCreationIndex).toHaveBeenCalledWith(f.index);
    fireEvent.click(screen.getByRole("button", { name: "Create 1 draft" }));
    await waitFor(() => expect(success).toHaveBeenCalledOnce());
    expect(execute).toHaveBeenCalledWith({ kind: "import-selected", snapshot: f.snapshot, candidateKeys: ["type:item0"] });
  });
  it("supports one asset, forbids empty selection, and retains choices across 50-item pages", async () => {
    const f = fixture(51);
    render(<AssetCreationDialog sourceApi={f.api} revision={0} execute={vi.fn(async () => true)} createWorker={() => f.worker} onClose={vi.fn()} onSuccess={vi.fn()} />);
    chooseFile(); await screen.findByRole("checkbox", { name: "Select Asset 1" });
    expect(screen.getAllByRole("checkbox")).toHaveLength(50);
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByRole("button", { name: "Create 0 drafts" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Asset 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Next candidates" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Asset 51" }));
    expect(screen.getByText("2 selected of 51 candidates")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous candidates" }));
    expect(screen.getByRole("checkbox", { name: "Select Asset 2" })).toHaveProperty("checked", true);
  });
  it("rejects invalid files and clears stale choices after a revision conflict", async () => {
    const f = fixture(1); const execute = vi.fn(async () => false);
    render(<AssetCreationDialog sourceApi={f.api} revision={0} execute={execute} createWorker={() => f.worker} onClose={vi.fn()} onSuccess={vi.fn()} />);
    chooseFile("image.png"); expect(screen.getByRole("alert").textContent).toMatch(/\.ifc/); expect(f.api.upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    chooseFile(); await screen.findByRole("checkbox", { name: "Select Asset 1" });
    fireEvent.click(screen.getByRole("button", { name: "Create 1 draft" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/analyze.*again/i);
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByLabelText("IFC file")).toBeTruthy();
  });
  it("refuses a selection when the catalog revision changes before import", async () => {
    const f = fixture(1); const execute = vi.fn(async () => true); const createWorker = () => f.worker;
    const props = { sourceApi: f.api, revision: 3, execute, createWorker, onClose: vi.fn(), onSuccess: vi.fn() };
    const view = render(<AssetCreationDialog {...props} />);
    chooseFile(); await screen.findByRole("checkbox", { name: "Select Asset 1" });
    view.rerender(<AssetCreationDialog {...props} revision={4} />);
    fireEvent.click(screen.getByRole("button", { name: "Create 1 draft" }));
    expect(screen.getByRole("alert").textContent).toMatch(/catalog changed/i);
    expect(execute).not.toHaveBeenCalled(); expect(screen.queryByRole("checkbox")).toBeNull();
  });
  it("opens Needs review only after the catalog confirms persistence", async () => {
    const f = fixture(1); let state = emptyCatalogLibrary(); let finish: (() => void) | undefined;
    const delayed = new Promise<void>(resolve => { finish = resolve; });
    const catalogApi: CatalogApi = { read: async () => state, execute: vi.fn(async command => { await delayed; state = applyLibraryCommand(state, command); return state; }) };
    render(<CatalogWorkspace catalogApi={catalogApi} sourceApi={f.api} createCreationWorker={() => f.worker} />);
    const upload = (await screen.findAllByRole("button", { name: "Upload IFC" }))[0]; if (!upload) throw Error("Upload missing");
    fireEvent.click(upload);
    chooseFile(); await screen.findByRole("checkbox", { name: "Select Asset 1" });
    fireEvent.click(screen.getByRole("button", { name: "Create 1 draft" }));
    expect(screen.getByRole("button", { name: "Library" }).getAttribute("aria-current")).toBe("page");
    expect(state.entries).toHaveLength(0);
    await act(async () => { finish?.(); await delayed; });
    await screen.findByRole("button", { name: "Inspect Asset 1" });
    expect(screen.getByRole("button", { name: "Needs review" }).getAttribute("aria-current")).toBe("page");
    expect(state.entries[0]?.status).toBe("draft");
    expect(catalogApi.execute).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 0, kind: "import-selected", candidateKeys: ["type:item0"] }));
  });
  it("retains honest completion notice and Library navigation after a submitted import is closed", async () => {
    const f = fixture(1); let state = emptyCatalogLibrary(); let finish: (() => void) | undefined;
    const delayed = new Promise<void>(resolve => { finish = resolve; });
    const catalogApi: CatalogApi = { read: async () => state, execute: async command => { await delayed; state = applyLibraryCommand(state, command); return state; } };
    render(<CatalogWorkspace catalogApi={catalogApi} sourceApi={f.api} createCreationWorker={() => f.worker} />);
    const upload = (await screen.findAllByRole("button", { name: "Upload IFC" }))[0]; if (!upload) throw Error("Upload missing");
    fireEvent.click(upload); chooseFile(); await screen.findByRole("checkbox", { name: "Select Asset 1" });
    fireEvent.click(screen.getByRole("button", { name: "Create 1 draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.getByText(/was submitted and may still finish/)).toBeTruthy();
    await act(async () => { finish?.(); await delayed; });
    expect(state.entries).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Library" }).getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Needs review" }));
    expect(screen.getByRole("button", { name: "Inspect Asset 1" })).toBeTruthy();
  });
  it("refreshes after an approval revision conflict and never publishes stale selections", async () => {
    const f = fixture(1); let state = applyLibraryCommand(emptyCatalogLibrary(), { kind: "import-selected", expectedRevision: 0, snapshot: f.snapshot, candidateKeys: ["type:item0"] });
    const catalogApi: CatalogApi = { read: vi.fn(async () => state), execute: vi.fn(async () => { state = { ...state, revision: state.revision + 1 }; throw new CatalogRequestError("REVISION_CONFLICT", "Catalog changed. Review the current drafts."); }) };
    render(<CatalogWorkspace catalogApi={catalogApi} sourceApi={f.api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Needs review" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Select all 1/ }));
    fireEvent.click(screen.getByRole("button", { name: /Approve selected/ }));
    await screen.findByText("Catalog changed. Review the current drafts.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Approve selected (0)" })).toHaveProperty("disabled", true));
    expect(state.entries[0]?.status).toBe("draft"); expect(catalogApi.read).toHaveBeenCalledTimes(2);
  });
  it("focuses review on generic identity and routes missing classification to Categories", async () => {
    const f = fixture(); let state = applyLibraryCommand(emptyCatalogLibrary(), { kind: "import-selected", expectedRevision: 0, snapshot: f.snapshot, candidateKeys: ["type:item1"] });
    render(<CatalogWorkspace catalogApi={{ read: async () => state, execute: async command => { state = applyLibraryCommand(state, command); return state; } }} sourceApi={f.api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Needs review" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect Asset 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit definition" }));
    const dialog = screen.getByRole("dialog", { name: "Edit definition" });
    expect(within(dialog).queryByRole("textbox", { name: "Manufacturer" })).toBeNull();
    expect(within(dialog).getByText("Additional definition details").closest("details")).toHaveProperty("open", false);
    expect(within(dialog).getByText("Source details").closest("details")).toHaveProperty("open", false);
    fireEvent.click(within(dialog).getByRole("button", { name: "Go to Categories" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Categories" }).getAttribute("aria-current")).toBe("page");
  });
  it.each(["upload", "analysis", "import"])("ignores late %s completion after closing", async stage => {
    const f = fixture(1); let resolve: (() => void) | undefined;
    const delayed = new Promise<void>(done => { resolve = done; });
    if (stage === "upload") f.api.upload = vi.fn(async () => { await delayed; return model; });
    if (stage === "analysis") f.worker.analyzeAssets = vi.fn(async () => { await delayed; return f.snapshot; });
    const success = vi.fn(); const close = vi.fn(); const execute = vi.fn(async () => { await delayed; return true; });
    const view = render(<AssetCreationDialog sourceApi={f.api} revision={0} execute={execute} createWorker={() => f.worker} onClose={close} onSuccess={success} />);
    chooseFile();
    if (stage === "analysis") await waitFor(() => expect(f.worker.analyzeAssets).toHaveBeenCalled());
    if (stage === "import") { await screen.findByRole("checkbox", { name: "Select Asset 1" }); fireEvent.click(screen.getByRole("button", { name: "Create 1 draft" })); expect(screen.getByText(/may still finish/)).toBeTruthy(); }
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" })); view.unmount();
    await act(async () => { resolve?.(); await delayed; });
    expect(success).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce();
    if (stage !== "upload") expect(f.worker.dispose).toHaveBeenCalled();
    if (stage === "upload") expect(f.worker.openModel).not.toHaveBeenCalled();
  });
  it("approves only eligible selected drafts and explains incomplete drafts without empty submission", async () => {
    const f = fixture(); let state = applyLibraryCommand(emptyCatalogLibrary(), { kind: "import-selected", expectedRevision: 0, snapshot: f.snapshot, candidateKeys: f.index.candidates.map(c => c.key) });
    const catalogApi: CatalogApi = { read: async () => state, execute: vi.fn(async command => { state = applyLibraryCommand(state, command); return state; }) };
    render(<CatalogWorkspace catalogApi={catalogApi} sourceApi={f.api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Needs review" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Select all 2/ }));
    expect(screen.getByText("1 ready of 2 selected; 1 needs attention.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Approve selected/ }));
    await screen.findByText("Approved 1 of 2 selected definitions. 1 stayed in Needs review.");
    expect(state.entries.filter(e => e.status === "approved")).toHaveLength(1);
    expect(screen.getByText(/Asset 2.*category/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /Select all 1/ }));
    fireEvent.click(screen.getByRole("button", { name: /Approve selected/ }));
    expect(catalogApi.execute).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/None.*ready.*edit/i)).toBeTruthy();
  });
});

