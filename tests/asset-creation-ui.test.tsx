// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { UploadAssetDetails } from "../src/catalog/UploadAssetDetails.js";
import { AssetCreationDialog } from "../src/catalog/AssetCreationDialog.js";
import type { ViewerLoader } from "../src/components/AssetInspector.js";
import { CatalogWorkspace } from "../src/catalog/CatalogWorkspace.js";
import type { CreationWorker } from "../src/catalog/useAssetCreation.js";
import type { CreationIndex } from "../shared/asset-creation.js";
import type { AssetUploadDetails, LibrarySnapshot } from "../shared/catalog-library.js";
import type { LibraryModel } from "../shared/contracts.js";
import type { LibraryApi } from "../src/library/api.js";
import { applyLibraryCommand, emptyCatalogLibrary } from "../shared/catalog-rules.js";
import { type CatalogApi, type CatalogAction } from "../src/catalog/api.js";

afterEach(cleanup);
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
const model: LibraryModel = { id: "10000000-0000-4000-8000-000000000001", name: "Furniture.ifc", fingerprint: "v1", size: 10, source: "upload", modifiedAt: "2026-10-06T00:00:00.000Z", index: null };
const previewViewer: ViewerLoader = async () => ({ default: () => <div>Selected geometry preview</div> });
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
  const worker: CreationWorker = { openModel: vi.fn(), discoverAssets: vi.fn(async () => index), analyzeAssets: vi.fn(async () => snapshot), readGeometry: vi.fn(async () => ({ meshes: [{ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), normals: new Float32Array(9), indices: new Uint32Array([0, 1, 2]), color: [1, 0, 0, 1], transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }] })), dispose: vi.fn() };
  return { api, worker, index, snapshot };
}
function chooseCategory(name: string) {
  const input = screen.getByRole("combobox", { name: "Asset category" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: name } });
  fireEvent.click(screen.getByRole("option", { name }));
}
function chooseFile(name = "Furniture.ifc") {
  fireEvent.change(screen.queryByLabelText("3D model files") ?? screen.getByLabelText("IFC file"), { target: { files: [new File(["IFC"], name)] } });
  fireEvent.click(screen.getByRole("button", { name: "Analyze IFC" }));
}
describe("guided asset creation", () => {
  it("searches categories alphabetically and selects with the keyboard without changing the asset name", () => {
    const categories = [
      { id: "valves", name: "Valves", aliases: [], ifcClass: "IFCVALVE", system: "" },
      { id: "fire", name: "Fire equipment", aliases: [], ifcClass: "IFCALARM", system: "5420 Brannalarmsystemer" },
      { id: "doors", name: "Doors", aliases: [], ifcClass: "IFCDOOR", system: "" },
    ];
    const submit = vi.fn();
    render(<UploadAssetDetails name="Smoke detector" source={null} occurrenceId={null} categories={categories} pending={false} onSubmit={submit} />);
    const category = screen.getByRole("combobox", { name: "Asset category" });
    fireEvent.focus(category);
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["Select category", "Doors", "Fire equipment", "Valves"]);
    fireEvent.change(category, { target: { value: "FIRE" } });
    expect(screen.queryByRole("option", { name: "Doors" })).toBeNull();
    expect(screen.getByRole("option", { name: "Fire equipment" })).toBeTruthy();
    fireEvent.keyDown(category, { key: "Enter" });
    expect(category).toHaveProperty("value", "Fire equipment");
    expect(screen.getByLabelText("IFC Class")).toHaveProperty("value", "IfcAlarm");
    expect(screen.getByLabelText("System")).toHaveProperty("value", "5420 Brannalarmsystemer");
    expect(screen.getByLabelText("Asset name")).toHaveProperty("value", "Smoke detector");
    fireEvent.focus(category);
    fireEvent.change(category, { target: { value: "missing category" } });
    expect(screen.getByRole("status").textContent).toBe("No matching categories.");
    fireEvent.keyDown(category, { key: "Enter" });
    expect(category.getAttribute("aria-expanded")).toBe("true");
    expect(submit).not.toHaveBeenCalled();
    fireEvent.keyDown(category, { key: "Escape" });
    expect(category).toHaveProperty("value", "Fire equipment");
    fireEvent.click(screen.getByRole("button", { name: "Save asset" }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "fire", name: "Smoke detector", ifcClass: "IFCALARM", system: "5420 Brannalarmsystemer" }));
    chooseCategory("Select category");
    expect(screen.getByLabelText("IFC Class")).toHaveProperty("value", "");
    expect(screen.getByRole("button", { name: "Save asset" })).toHaveProperty("disabled", true);
  });
  it("allows editing only the name and fills read-only classifications from the category", () => {
    const categories = [{ id: "fire", name: "Fire equipment", aliases: [], ifcClass: "IFCALARM", system: "5420 Brannalarmsystemer" }];
    const submit = vi.fn();
    const props = { name: "Alarm", source: null, occurrenceId: null, categories, onSubmit: submit };
    const { rerender } = render(<UploadAssetDetails {...props} pending={false} />);
    const fields = [screen.getByLabelText("Asset name"), screen.getByLabelText("IFC Class"), screen.getByLabelText("System")];
    const name = screen.getByLabelText("Asset name");
    expect(name.matches(":disabled")).toBe(false);
    expect(name).toHaveProperty("readOnly", false);
    for (const label of ["IFC Class", "System"]) {
      expect(screen.getByLabelText(label)).toHaveProperty("readOnly", true);
      expect(screen.getByLabelText(label)).toHaveProperty("value", "");
    }
    fireEvent.change(name, { target: { value: "Smoke detector" } });
    expect(screen.getByRole("button", { name: "Save asset" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Save asset" }));
    expect(submit).not.toHaveBeenCalled();
    chooseCategory("Fire equipment");
    expect(name).toHaveProperty("value", "Smoke detector");
    expect(screen.getByLabelText("IFC Class")).toHaveProperty("value", "IfcAlarm");
    expect(screen.getByLabelText("System")).toHaveProperty("value", "5420 Brannalarmsystemer");
    fireEvent.click(screen.getByRole("button", { name: "Save asset" }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "fire", name: "Smoke detector", ifcClass: "IFCALARM", system: "5420 Brannalarmsystemer" }));
    rerender(<UploadAssetDetails {...props} pending={true} />);
    for (const field of fields) expect(field.matches(":disabled")).toBe(true);
  });
  it.each([true, false])("uses saved category assignments for a new asset (IFC source: %s)", async hasSource => {
    const f = fixture(1);
    let state = applyLibraryCommand(emptyCatalogLibrary(), { kind: "category", expectedRevision: 0,
      id: "fire", name: "Fire equipment", aliases: [], ifcClass: "IFCALARM", system: "5420 Fire Alarm Systems" });
    const submit = vi.fn<(details: AssetUploadDetails) => void>();
    render(<UploadAssetDetails name="Alarm" source={hasSource ? f.snapshot.types[0] ?? null : null} occurrenceId={1}
      categories={state.categories} pending={false} onSubmit={submit} />);
    chooseCategory("Fire equipment");
    expect(screen.getByLabelText("IFC Class")).toHaveProperty("value", "IfcAlarm");
    expect(screen.getByLabelText("System")).toHaveProperty("value", "5420 Fire Alarm Systems");
    fireEvent.click(screen.getByRole("button", { name: "Save asset" }));
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "fire", ifcClass: "IFCALARM", system: "5420 Fire Alarm Systems" }));
    const details = submit.mock.calls[0]?.[0];
    if (!details) throw Error("No asset details submitted");
    state = applyLibraryCommand(state, { kind: "import-asset", expectedRevision: state.revision,
      snapshot: f.snapshot, candidateKey: "type:item0", details });
    expect(state.categories.map(category => category.name)).toEqual(["Fire equipment"]);
    expect(state.entries[0]?.definition).toMatchObject({ categoryId: "fire", specifications: {
      "IFC Class": { kind: "text", value: "IFCALARM", unit: null },
      System: { kind: "text", value: "5420 Fire Alarm Systems", unit: null },
    } });
  });
  it("keeps AI drafts and reference files local without starting asset creation", () => {
    const f = fixture(1);
    const execute = vi.fn(async () => true);
    render(<AssetCreationDialog onGeometryFiles={vi.fn()} sourceApi={f.api} revision={0} execute={execute}
      createWorker={() => f.worker} onClose={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("AI asset description"), { target: { value: "Create a smoke detector" } });
    const photo = new File(["reference"], "detector.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("AI reference file picker"), { target: { files: [photo] } });
    expect(screen.getByText("detector.png")).toBeTruthy();
    const document = new File(["dimensions"], "dimensions.pdf", { type: "application/pdf" });
    fireEvent.drop(screen.getByRole("region", { name: "AI reference files" }), { dataTransfer: { files: [document] } });
    expect(screen.getByText("dimensions.pdf")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove reference detector.png" }));
    expect(screen.queryByText("detector.png")).toBeNull();
    expect(screen.getByLabelText("AI asset description")).toHaveProperty("value", "Create a smoke detector");
    expect(screen.getByRole("button", { name: "Send AI message" })).toHaveProperty("disabled", true);
    expect(f.api.upload).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
  it("keeps the type name across category changes and ignores legacy source mappings", async () => {
    const f = fixture(1);
    const categories = [
      { id: "sensors", name: "Sensors", aliases: [], ifcClass: "IFCALARM", system: "5420 Brannalarmsystemer",
        uploadMappings: { name: "missing-name", ifcClass: "missing-class", system: "missing-system", fdvuDocumentationUrl: "" } },
      { id: "other", name: "Other", aliases: [], ifcClass: "IFCFURNITURE", system: "" },
    ];
    const execute = vi.fn(async () => true);
    render(<AssetCreationDialog categories={categories} loadViewer={previewViewer} sourceApi={f.api} revision={0} execute={execute}
      createWorker={() => f.worker} onClose={vi.fn()} onSuccess={vi.fn()} />);
    chooseFile();
    await screen.findByLabelText("Asset category");
    chooseCategory("Sensors");
    expect(screen.getByLabelText("Asset name")).toHaveProperty("value", "Asset 1");
    expect(screen.getByLabelText("IFC Class")).toHaveProperty("value", "IfcAlarm");
    expect(screen.getByLabelText("System")).toHaveProperty("value", "5420 Brannalarmsystemer");
    expect(screen.queryByText("Source property")).toBeNull();
    expect(screen.queryByRole("combobox", { name: /Map .* from IFC/ })).toBeNull();
    chooseCategory("Other");
    expect(screen.getByLabelText("Asset name")).toHaveProperty("value", "Asset 1");
    expect(screen.getByLabelText("IFC Class")).toHaveProperty("value", "IfcFurniture");
    expect(screen.getByLabelText("System")).toHaveProperty("value", "");
    fireEvent.click(screen.getByRole("button", { name: "Save asset" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ details: {
      categoryId: "other", name: "Asset 1", ifcClass: "IFCFURNITURE", system: "", fdvuDocumentationUrl: "",
    } })));
  });
  it("saves classifications inherited from the selected category in the creation dialog", async () => {
    const f = fixture(1);
    const categories = [{ id: "fire", name: "Fire equipment", aliases: [], ifcClass: "IFCALARM", system: "5420 Brannalarmsystemer" }];
    const execute = vi.fn(async () => true);
    render(<AssetCreationDialog categories={categories} loadViewer={previewViewer} sourceApi={f.api} revision={0} execute={execute}
      createWorker={() => f.worker} onClose={vi.fn()} onSuccess={vi.fn()} />);
    chooseFile();
    await screen.findByLabelText("Asset category");
    expect(screen.getByLabelText("IFC Class")).toHaveProperty("value", "");
    expect(screen.queryByText("Source property")).toBeNull();
    expect(screen.queryByLabelText("FDVU Documentation")).toBeNull();
    expect(screen.queryByText(/Detected properties/)).toBeNull();
    chooseCategory("Fire equipment");
    for (const label of ["IFC Class", "System"]) expect(screen.getByLabelText(label)).toHaveProperty("readOnly", true);
    fireEvent.change(screen.getByLabelText("Asset name"), { target: { value: "Smoke detector" } });
    fireEvent.click(screen.getByRole("button", { name: "Save asset" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ details: {
      categoryId: "fire", name: "Smoke detector", ifcClass: "IFCALARM", system: "5420 Brannalarmsystemer", fdvuDocumentationUrl: "",
    } })));
  });
  it("blocks saving until the selected geometry is ready and ignores an earlier type's late preview", async () => {
    const f = fixture();
    const readGeometry = f.worker.readGeometry;
    let finish: (() => void) | undefined;
    const delayed = new Promise<void>(resolve => { finish = resolve; });
    f.worker.readGeometry = vi.fn(async args => {
      if (args.elementId === 1) await delayed;
      return readGeometry(args);
    });
    const execute = vi.fn(async () => true);
    render(<AssetCreationDialog loadViewer={previewViewer} sourceApi={f.api} revision={0} execute={execute}
      createWorker={() => f.worker} onClose={vi.fn()} onSuccess={vi.fn()} />);
    chooseFile();
    fireEvent.click(await screen.findByRole("radio", { name: "Select Asset 1" }));
    expect(screen.getByRole("button", { name: "Save asset" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("radio", { name: "Select Asset 2" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save asset" })).toHaveProperty("disabled", false));
    await act(async () => { finish?.(); await delayed; });
    expect(screen.getByRole("radio", { name: "Select Asset 1" })).toHaveProperty("checked", false);
    fireEvent.click(screen.getByRole("button", { name: "Save asset" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith({ kind: "import-asset", snapshot: f.snapshot, candidateKey: "type:item1", details: { name: "Asset 2", ifcClass: "IFCFURNITURETYPE", system: "", fdvuDocumentationUrl: "" } }));
  });
  it("does not save a type without preview geometry", async () => {
    const f = fixture(1);
    f.worker.readGeometry = vi.fn(async () => ({ meshes: [] }));
    const execute = vi.fn(async () => true);
    render(<AssetCreationDialog loadViewer={previewViewer} sourceApi={f.api} revision={0} execute={execute}
      createWorker={() => f.worker} onClose={vi.fn()} onSuccess={vi.fn()} />);
    chooseFile();
    await screen.findByText("This type has no preview geometry. Choose another type or IFC file.");
    expect(screen.getByRole("button", { name: "Save asset" })).toHaveProperty("disabled", true);
    expect(execute).not.toHaveBeenCalled();
  });
  it("lists matching types once and previews and saves only their first definition", async () => {
    const f = fixture(3);
    const first = f.index.candidates[0];
    const duplicate = f.index.candidates[2];
    const observation = f.snapshot.types[2];
    if (!first || !duplicate || !observation) throw Error("Missing fixture type");
    duplicate.name = first.name;
    observation.name = first.name;
    const execute = vi.fn(async () => true);
    render(<AssetCreationDialog loadViewer={previewViewer} sourceApi={f.api} revision={0} execute={execute} createWorker={() => f.worker} onClose={vi.fn()} onSuccess={vi.fn()} />);
    chooseFile();
    const checkbox = await screen.findByRole("radio", { name: "Select Asset 1" });
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Furniture" })).toBeTruthy();
    expect(screen.getByText(/2 occurrences/)).toBeTruthy();
    fireEvent.click(checkbox);
    expect(screen.getByRole("button", { name: "Save asset" })).toHaveProperty("disabled", true);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save asset" })).toHaveProperty("disabled", false));
    expect(f.worker.readGeometry).toHaveBeenCalledWith({ modelId: model.id, elementId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Save asset" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith({ kind: "import-asset", snapshot: f.snapshot, candidateKey: "type:item0", details: { name: "Asset 1", ifcClass: "IFCFURNITURETYPE", system: "", fdvuDocumentationUrl: "" } }));
  });
  it("summarizes physical occurrences separately from candidates and includes conflicting classification workload", async () => {
    const f = fixture(3);
    const candidate = f.index.candidates[0];
    if (!candidate) throw Error("Missing candidate");
    candidate.occurrenceIds = [1, 4, 5];
    candidate.classificationIssues = ["Conflicting Generic Hard Asset values"];
    f.index.stats.elements = 5;
    render(<AssetCreationDialog loadViewer={previewViewer} sourceApi={f.api} revision={0} execute={vi.fn(async () => true)} createWorker={() => f.worker} onClose={vi.fn()} onSuccess={vi.fn()} />);
    chooseFile(); await screen.findByRole("radio", { name: "Select Asset 1" });
    expect(screen.getByText("5 physical occurrences · 2 repeated occurrences · 2 candidates need classification")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Select Asset 2" }));
    expect(screen.getByText("5 physical occurrences · 2 repeated occurrences · 2 candidates need classification")).toBeTruthy();
  });
  it("requires a fresh file after choosing another IFC", async () => {
    const f = fixture(1);
    render(<AssetCreationDialog loadViewer={previewViewer} sourceApi={f.api} revision={0} execute={vi.fn(async () => true)} createWorker={() => f.worker} onClose={vi.fn()} onSuccess={vi.fn()} />);
    chooseFile(); await screen.findByRole("radio", { name: "Select Asset 1" });
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
      render(<CatalogWorkspace loadViewer={previewViewer} catalogApi={{ read: async () => state, execute: vi.fn() }} sourceApi={f.api} createCreationWorker={() => f.worker} />);
      const upload = (await screen.findAllByRole("button", { name: "Create asset" }))[0];
      if (!upload) throw Error("No upload action");
      upload.focus(); fireEvent.click(upload);
      const dialog = screen.getByRole("dialog", { name: "Create asset" });
      expect(within(dialog).getByLabelText("3D model files")).toBeTruthy();
      fireEvent(dialog, new Event("cancel", { cancelable: true }));
      expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(upload);
      cleanup();
    }
  });
  it("requires choosing one type from a multi-type IFC before preview and import", async () => {
    const f = fixture(); const execute = vi.fn(async () => true); const success = vi.fn();
    render(<AssetCreationDialog loadViewer={previewViewer} sourceApi={f.api} revision={7} execute={execute} createWorker={() => f.worker} onClose={vi.fn()} onSuccess={success} />);
    chooseFile();
    const first = await screen.findByRole("radio", { name: "Select Asset 1" });
    expect(first).toHaveProperty("checked", false);
    expect(screen.getByRole("radio", { name: "Select Asset 2" })).toHaveProperty("checked", false);
    expect(screen.getByText("2 physical occurrences · 0 repeated occurrences · 1 candidate needs classification")).toBeTruthy();
    expect(execute).not.toHaveBeenCalled(); expect(success).not.toHaveBeenCalled();
    expect(f.worker.openModel).toHaveBeenCalledWith(expect.objectContaining({ purpose: "creation" }));
    expect(f.api.saveCreationIndex).toHaveBeenCalledWith(f.index);
    fireEvent.click(first);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save asset" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("button", { name: "Save asset" }));
    await waitFor(() => expect(success).toHaveBeenCalledOnce());
    expect(execute).toHaveBeenCalledWith({ kind: "import-asset", snapshot: f.snapshot, candidateKey: "type:item0", details: { name: "Asset 1", ifcClass: "IFCFURNITURETYPE", system: "", fdvuDocumentationUrl: "" } });
  });
  it("supports one asset, forbids empty selection, and retains choices across 50-item pages", async () => {
    const f = fixture(51);
    render(<AssetCreationDialog loadViewer={previewViewer} sourceApi={f.api} revision={0} execute={vi.fn(async () => true)} createWorker={() => f.worker} onClose={vi.fn()} onSuccess={vi.fn()} />);
    chooseFile(); await screen.findByRole("radio", { name: "Select Asset 1" });
    expect(screen.getAllByRole("radio")).toHaveLength(50);
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByRole("button", { name: "Save asset" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("radio", { name: "Select Asset 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Next candidates" }));
    fireEvent.click(screen.getByRole("radio", { name: "Select Asset 51" }));
    expect(screen.getByText("1 selected of 51 types · one asset per upload")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous candidates" }));
    expect(screen.getByRole("radio", { name: "Select Asset 2" })).toHaveProperty("checked", false);
  });
  it("rejects invalid files and clears stale choices after a revision conflict", async () => {
    const f = fixture(1); const execute = vi.fn(async () => false);
    render(<AssetCreationDialog loadViewer={previewViewer} sourceApi={f.api} revision={0} execute={execute} createWorker={() => f.worker} onClose={vi.fn()} onSuccess={vi.fn()} />);
    chooseFile("image.png"); expect(screen.getByRole("alert").textContent).toMatch(/\.ifc/); expect(f.api.upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    chooseFile(); await screen.findByRole("radio", { name: "Select Asset 1" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save asset" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("button", { name: "Save asset" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/analyze.*again/i);
    expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByLabelText("IFC file")).toBeTruthy();
  });
  it("refuses a selection when the catalog revision changes before import", async () => {
    const f = fixture(1); const execute = vi.fn(async () => true); const createWorker = () => f.worker;
    const props = { sourceApi: f.api, revision: 3, execute, createWorker, onClose: vi.fn(), onSuccess: vi.fn() };
    const view = render(<AssetCreationDialog loadViewer={previewViewer} {...props} />);
    chooseFile(); await screen.findByRole("radio", { name: "Select Asset 1" });
    view.rerender(<AssetCreationDialog loadViewer={previewViewer} {...props} revision={4} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save asset" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("button", { name: "Save asset" }));
    expect(screen.getByRole("alert").textContent).toMatch(/catalog changed/i);
    expect(execute).not.toHaveBeenCalled(); expect(screen.queryByRole("radio")).toBeNull();
  });
  it("shows the saved asset in Library only after the catalog confirms persistence", async () => {
    const f = fixture(1); let state = emptyCatalogLibrary(); let finish: (() => void) | undefined;
    const delayed = new Promise<void>(resolve => { finish = resolve; });
    const catalogApi: CatalogApi = { read: async () => state, execute: vi.fn(async command => { await delayed; state = applyLibraryCommand(state, command); return state; }) };
    render(<CatalogWorkspace loadViewer={previewViewer} catalogApi={catalogApi} sourceApi={f.api} createCreationWorker={() => f.worker} />);
    const upload = (await screen.findAllByRole("button", { name: "Create asset" }))[0]; if (!upload) throw Error("Upload missing");
    fireEvent.click(upload);
    chooseFile(); await screen.findByRole("radio", { name: "Select Asset 1" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save asset" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("button", { name: "Save asset" }));
    expect(screen.getByRole("button", { name: "Library" }).getAttribute("aria-current")).toBe("page");
    expect(state.entries).toHaveLength(0);
    await act(async () => { finish?.(); await delayed; });
    await screen.findByRole("button", { name: "Inspect Asset 1" });
    expect(screen.getByRole("button", { name: "Library" }).getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("button", { name: "Needs review" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
    expect(state.entries[0]?.status).toBe("draft");
    expect(catalogApi.execute).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 0, kind: "import-asset", candidateKey: "type:item0" }));
  });
  it("retains honest completion notice and Library navigation after a submitted import is closed", async () => {
    const f = fixture(1); let state = emptyCatalogLibrary(); let finish: (() => void) | undefined;
    const delayed = new Promise<void>(resolve => { finish = resolve; });
    const catalogApi: CatalogApi = { read: async () => state, execute: async command => { await delayed; state = applyLibraryCommand(state, command); return state; } };
    render(<CatalogWorkspace loadViewer={previewViewer} catalogApi={catalogApi} sourceApi={f.api} createCreationWorker={() => f.worker} />);
    const upload = (await screen.findAllByRole("button", { name: "Create asset" }))[0]; if (!upload) throw Error("Upload missing");
    fireEvent.click(upload); chooseFile(); await screen.findByRole("radio", { name: "Select Asset 1" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save asset" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("button", { name: "Save asset" }));
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.getByText(/was submitted and may still finish/)).toBeTruthy();
    await act(async () => { finish?.(); await delayed; });
    expect(state.entries).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Library" }).getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Inspect Asset 1" })).toBeTruthy();
  });

  it("keeps generic asset editing limited to name and classifications", async () => {
    const f = fixture(); let state = applyLibraryCommand(emptyCatalogLibrary(), { kind: "import-selected", expectedRevision: 0, snapshot: f.snapshot, candidateKeys: ["type:item1"] });
    render(<CatalogWorkspace loadViewer={previewViewer} catalogApi={{ read: async () => state, execute: async command => { state = applyLibraryCommand(state, command); return state; } }} sourceApi={f.api} />);
    fireEvent.click(await screen.findByRole("button", { name: "Inspect Asset 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit definition" }));
    const dialog = screen.getByRole("dialog", { name: "Edit definition" });
    expect(within(dialog).queryByRole("textbox", { name: "Manufacturer" })).toBeNull();
    expect(within(dialog).queryByText("Additional definition details")).toBeNull();
    expect(within(dialog).queryByText("Source details")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Go to Categories" })).toBeNull();
    expect(within(dialog).getByRole("textbox", { name: "Asset name" })).toBeTruthy();
    expect(within(dialog).getByRole("combobox", { name: "IFC Class" })).toBeTruthy();
    expect(within(dialog).getByRole("combobox", { name: "System" })).toBeTruthy();
  });
  it.each(["upload", "analysis", "import"])("ignores late %s completion after closing", async stage => {
    const f = fixture(1); let resolve: (() => void) | undefined;
    const delayed = new Promise<void>(done => { resolve = done; });
    if (stage === "upload") f.api.upload = vi.fn(async () => { await delayed; return model; });
    if (stage === "analysis") f.worker.analyzeAssets = vi.fn(async () => { await delayed; return f.snapshot; });
    const success = vi.fn(); const close = vi.fn(); const execute = vi.fn(async () => { await delayed; return true; });
    const view = render(<AssetCreationDialog loadViewer={previewViewer} sourceApi={f.api} revision={0} execute={execute} createWorker={() => f.worker} onClose={close} onSuccess={success} />);
    chooseFile();
    if (stage === "analysis") await waitFor(() => expect(f.worker.analyzeAssets).toHaveBeenCalled());
    if (stage === "import") { await screen.findByRole("radio", { name: "Select Asset 1" }); await waitFor(() => expect(screen.getByRole("button", { name: "Save asset" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("button", { name: "Save asset" })); expect(screen.getByText(/may still finish/)).toBeTruthy(); }
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" })); view.unmount();
    await act(async () => { resolve?.(); await delayed; });
    expect(success).not.toHaveBeenCalled(); expect(close).toHaveBeenCalledOnce();
    if (stage !== "upload") expect(f.worker.dispose).toHaveBeenCalled();
    if (stage === "upload") expect(f.worker.openModel).not.toHaveBeenCalled();
  });

});
