import type { ViewerLoader } from "../src/components/AssetInspector.js";
// @vitest-environment jsdom
import {
  act,
  renderHook,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CatalogWorkspace } from "../src/catalog/CatalogWorkspace.js";
import {
  CatalogDomainError,
  applyLibraryCommand,
  emptyCatalogLibrary,
} from "../shared/catalog-rules.js";
import type {
  CatalogLibrary,
  LibraryCommand,
  LibrarySnapshot,
} from "../shared/catalog-library.js";
import { CatalogRequestError } from "../src/catalog/api.js";
import type { LibraryModel } from "../shared/contracts.js";
import type { LibraryWorker } from "../src/library/useLibrary.js";
import { useDefinitionPreview } from "../src/catalog/useDefinitionPreview.js";
import { useCatalogLibrary } from "../src/catalog/useCatalogLibrary.js";
import { useSourceAnalysis } from "../src/catalog/useSourceAnalysis.js";
import type { AnalysisWorker } from "../src/catalog/useSourceAnalysis.js";
import type { CatalogApi } from "../src/catalog/api.js";
import type { LibraryApi } from "../src/library/api.js";
import type { GeometryApi } from "../src/catalog/geometry-api.js";
import type { GeometryRecord } from "../shared/mesh-geometry.js";
afterEach(cleanup);
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
const snapshot: LibrarySnapshot = {
  modelId: "model",
  fingerprint: "v1",
  sourceName: "Furniture.ifc",
  types: [
    {
      typeGlobalId: "cabinet",
      name: "Cabinet",
      ifcClass: "IFCFURNITURETYPE",
      categories: ["Cabinets"],
      occurrenceIds: [1, 2],
      fields: [
        {
          key: "width",
          pset: "Dimensions",
          name: "Width",
          measure: "IfcLengthMeasure",
          unit: "mm",
          values: [
            {
              rawValue: "600",
              normalized: { kind: "number", value: 0.6, unit: "m" },
              occurrenceIds: [1, 2],
            },
          ],
        },
      ],
    },
  ],
};
function fixture(approved = false) {
  let state = applyLibraryCommand(emptyCatalogLibrary(), {
    kind: "import",
    expectedRevision: 0,
    snapshot,
  });
  const entry = state.entries[0];
  if (!entry) throw new Error("fixture");
  if (approved) {
    state = applyLibraryCommand(state, {
      kind: "edit",
      expectedRevision: state.revision,
      entryId: entry.id,
      definition: {
        ...entry.definition,
        specifications: { width: { kind: "number", value: 0.6, unit: "m" } },
      },
    });
    state = applyLibraryCommand(state, {
      kind: "approve",
      expectedRevision: state.revision,
      entryIds: [entry.id],
    });
  }
  const api: CatalogApi = {
    read: vi.fn(async () => state),
    execute: vi.fn(async (command: LibraryCommand) => {
      try {
        state = applyLibraryCommand(state, command);
        return state;
      } catch (error) {
        if (error instanceof CatalogDomainError)
          throw new CatalogRequestError(
            error.code,
            [error.message, ...error.issues].join(" "),
          );
        throw error;
      }
    }),
  };
  const sources: LibraryApi = {
    list: vi.fn(async () => []),
    hide: vi.fn(async () => {}),
    saveIndex: vi.fn(),
    saveCreationIndex: vi.fn(),
    upload: vi.fn(),
  };
  return { api, sources, getState: () => state };
}
function chooseClassification(label: string, value: string) {
  const input = screen.getByRole("combobox", { name: label });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getByRole("option", { name: value || "Not assigned" }));
}
describe("curated catalog", () => {
  it("searches managed categories by name, IFC Class and System and opens matching details", async () => {
    const f = fixture();
    const state = structuredClone(f.getState());
    state.categories.push(
      { id: "valves", name: "Valves", aliases: [], ifcClass: "IFCVALVE", system: "3200 Heating" },
      { id: "fire", name: "Fire equipment", aliases: [], ifcClass: "IFCALARM", system: "5420 Brannalarmsystemer" },
    );
    const api: CatalogApi = { read: async () => state, execute: vi.fn() };
    render(<CatalogWorkspace catalogApi={api} sourceApi={f.sources} />);
    fireEvent.click(await screen.findByRole("button", { name: "Categories" }));
    const table = screen.getByRole("table", { name: "Generic Hard Asset categories" });
    const search = screen.getByRole("searchbox", { name: "Search categories" });
    expect(within(table).getAllByRole("rowheader").map(cell => cell.textContent)).toEqual(["Cabinets", "Fire equipment", "Valves"]);
    for (const query of [" FIRE ", "ifcalarm", "5420", "brannalarm"]) {
      fireEvent.change(search, { target: { value: query } });
      expect(within(table).getAllByRole("rowheader").map(cell => cell.textContent)).toEqual(["Fire equipment"]);
    }
    fireEvent.click(screen.getByRole("button", { name: "Open Fire equipment category" }));
    const dialog = screen.getByRole("dialog", { name: "Fire equipment category" });
    expect(within(dialog).getByLabelText("IFC Class")).toHaveProperty("value", "IFCALARM");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close dialog" }));
    fireEvent.change(search, { target: { value: "missing category" } });
    expect(within(table).queryAllByRole("rowheader")).toHaveLength(0);
    expect(within(table).getByText("No categories match your search.")).toBeTruthy();
    fireEvent.change(search, { target: { value: "" } });
    expect(within(table).getAllByRole("rowheader")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Add category" })).toBeTruthy();
    expect(api.execute).not.toHaveBeenCalled();
  });
  it("lists saved category assignments independently of model asset values", async () => {
    const f = fixture();
    const state = structuredClone(f.getState());
    const base = required(state.entries[0]);
    const first = { ...base, definition: { ...base.definition, specifications: {
      "IFC Class": { kind: "text", value: "IFCVALVE", unit: null },
      System: { kind: "text", value: "5420 Brannalarmsystemer", unit: null },
    } } } satisfies CatalogLibrary["entries"][number];
    const second = structuredClone(first);
    second.id = "second";
    second.definition.specifications["IFC Class"] = { kind: "text", value: "IFCDAMPER", unit: null };
    second.definition.specifications.System = { kind: "text", value: "5430 Fire Suppression", unit: null };
    const duplicate = { ...structuredClone(first), id: "duplicate" };
    const archived = { ...structuredClone(first), id: "archived", status: "archived" } satisfies CatalogLibrary["entries"][number];
    archived.definition.specifications.System = { kind: "text", value: "Old system", unit: null };
    state.entries = [first, second, duplicate, archived];
    const category = required(state.categories[0]);
    category.ifcClass = "IFCALARM";
    category.system = "Category system";
    state.categories.push({ id: "unassigned", name: "Unassigned category", aliases: [] });
    const api: CatalogApi = { read: async () => state, execute: vi.fn() };
    render(<CatalogWorkspace catalogApi={api} sourceApi={f.sources} />);
    fireEvent.click(await screen.findByRole("button", { name: "Categories" }));
    const table = screen.getByRole("table", { name: "Generic Hard Asset categories" });
    const row = within(table).getByRole("row", { name: /Cabinets/ });
    expect(within(row).getAllByRole("cell").map(cell => cell.textContent)).toEqual([
      "IFCALARM", "Category system",
    ]);
    const unassigned = within(table).getByRole("row", { name: /Unassigned category/ });
    expect(within(unassigned).getAllByRole("cell").map(cell => cell.textContent)).toEqual(["—", "—"]);
    expect(screen.queryByText("Old system")).toBeNull();
    expect(screen.queryByLabelText("Category name")).toBeNull();
    expect(api.execute).not.toHaveBeenCalled();
  });
  it("adds a category from the table and opens its saved details", async () => {
    const f = fixture();
    render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
    fireEvent.click(await screen.findByRole("button", { name: "Categories" }));
    const add = screen.getByRole("button", { name: "Add category" });
    add.focus();
    fireEvent.click(add);
    const dialog = screen.getByRole("dialog", { name: "Add category" });
    fireEvent.change(within(dialog).getByLabelText("Category name"), { target: { value: "Fire equipment" } });
    chooseClassification("IFC Class", "IFCALARM");
    chooseClassification("System", "5420 Brannalarmsystemer");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save category" }));
    await within(dialog).findByText("Category saved.");
    expect(f.getState().categories.find(category => category.name === "Fire equipment")).toMatchObject({ ifcClass: "IFCALARM", system: "5420 Brannalarmsystemer" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close dialog" }));
    expect(document.activeElement).toBe(add);
    fireEvent.click(screen.getByRole("button", { name: "Open Fire equipment category" }));
    const details = screen.getByRole("dialog", { name: "Fire equipment category" });
    expect(within(details).getByLabelText("Category name")).toHaveProperty("value", "Fire equipment");
    expect(within(details).getByLabelText("IFC Class")).toHaveProperty("value", "IFCALARM");
    expect(within(details).getByLabelText("System")).toHaveProperty("value", "5420 Brannalarmsystemer");
    fireEvent.click(within(details).getByRole("button", { name: "Close dialog" }));
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    expect(screen.getByRole("checkbox", { name: "Fire equipment" })).toBeTruthy();
  });
  it("shows a rejected category save inside its details pop-up and preserves edits", async () => {
    const f = fixture();
    const api: CatalogApi = { read: f.api.read, execute: vi.fn(async () => {
      throw new CatalogRequestError("INVALID_COMMAND", "Category labels must map to one canonical category.");
    }) };
    render(<CatalogWorkspace catalogApi={api} sourceApi={f.sources} />);
    fireEvent.click(await screen.findByRole("button", { name: "Categories" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Cabinets category" }));
    const dialog = screen.getByRole("dialog", { name: "Cabinets category" });
    fireEvent.change(within(dialog).getByLabelText("Category name"), { target: { value: "Changed name" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save category" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Category labels");
    expect(within(dialog).getByLabelText("Category name")).toHaveProperty("value", "Changed name");
    expect(dialog).toHaveProperty("open", true);
  });
  it("keeps optional FDVU documentation editable without displaying it in Parameters", async () => {
    const f = fixture();
    render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
    fireEvent.click(await screen.findByRole("button", { name: "Inspect Cabinet" }));
    expect(screen.queryByText("FDVU Documentation")).toBeNull();
    expect(screen.queryByRole("link", { name: "Open FDVU documentation" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit definition" }));
    const input = screen.getByLabelText("FDVU Documentation");
    expect(input).toHaveProperty("value", "");
    fireEvent.change(input, { target: { value: "https://example.com/fdvu.pdf" } });
    fireEvent.click(screen.getByRole("button", { name: "Save definition" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(f.getState().entries[0]?.definition.fdvuDocumentationUrl).toBe("https://example.com/fdvu.pdf");
    expect(screen.queryByText("FDVU Documentation")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preview Cabinet" }));
    const preview = screen.getByRole("dialog", { name: "Definition preview" });
    expect(within(preview).queryByText("FDVU Documentation")).toBeNull();
    expect(within(preview).queryByRole("link", { name: "Open FDVU documentation" })).toBeNull();
  });
  it("filters saved assets by multiple checked categories and resets to all", async () => {
    const f = fixture(true);
    const state = structuredClone(f.getState());
    const base = required(state.entries[0]);
    const cabinets = required(state.categories[0]);
    const doors = { id: crypto.randomUUID(), name: "Doors", aliases: [] };
    const lights = { id: crypto.randomUUID(), name: "Lights", aliases: [] };
    state.categories.push(doors, lights);
    state.entries = [cabinets, doors, lights].flatMap(category =>
      (["approved", "draft"] as const).map(status => ({
        ...structuredClone(base), id: crypto.randomUUID(), status,
        definition: { ...structuredClone(base.definition), name: `${category.name} ${status}`, categoryId: category.id },
      })),
    );
    render(<CatalogWorkspace catalogApi={{ read: async () => state, execute: vi.fn() }} sourceApi={f.sources} />);
    await screen.findByRole("button", { name: "Inspect Cabinets approved" });
    for (const status of ["approved", "draft"]) {
      fireEvent.click(screen.getByRole("button", { name: "Library" }));

      expect(screen.getByRole("checkbox", { name: "Cabinets" })).toHaveProperty("checked", true);
      fireEvent.click(screen.getByRole("checkbox", { name: "All categories" }));
      expect(screen.queryByRole("button", { name: `Inspect Cabinets ${status}` })).toBeNull();
      fireEvent.click(screen.getByRole("checkbox", { name: "Cabinets" }));
      expect(screen.getByRole("button", { name: `Inspect Cabinets ${status}` })).toBeTruthy();
      expect(screen.queryByRole("button", { name: `Inspect Doors ${status}` })).toBeNull();
      fireEvent.click(screen.getByRole("checkbox", { name: "Doors" }));
      expect(screen.getByRole("button", { name: `Inspect Doors ${status}` })).toBeTruthy();
      expect(screen.queryByRole("button", { name: `Inspect Lights ${status}` })).toBeNull();
      fireEvent.click(screen.getByRole("checkbox", { name: "Cabinets" }));
      expect(screen.queryByRole("button", { name: `Inspect Cabinets ${status}` })).toBeNull();
      fireEvent.click(screen.getByRole("checkbox", { name: "All categories" }));
      expect(screen.getByRole("button", { name: `Inspect Lights ${status}` })).toBeTruthy();
      expect(screen.getByRole("checkbox", { name: "Doors" })).toHaveProperty("checked", true);
      fireEvent.click(screen.getByRole("checkbox", { name: "Lights" }));
      expect(screen.getByRole("checkbox", { name: "All categories" })).toHaveProperty("checked", false);
      expect(screen.getByRole("checkbox", { name: "Doors" })).toHaveProperty("checked", true);
      expect(screen.queryByRole("button", { name: `Inspect Lights ${status}` })).toBeNull();
      fireEvent.click(screen.getByRole("checkbox", { name: "Lights" }));
      expect(screen.getByRole("checkbox", { name: "All categories" })).toHaveProperty("checked", true);
      expect(screen.queryByLabelText("Definition kind")).toBeNull();
      const categorySearch = screen.getByRole("searchbox", { name: "Search categories" });
      fireEvent.change(categorySearch, { target: { value: " DOO " } });
      expect(screen.queryByRole("checkbox", { name: "Cabinets" })).toBeNull();
      expect(screen.getByRole("checkbox", { name: "Doors" })).toHaveProperty("checked", true);
      expect(screen.getByRole("button", { name: `Inspect Cabinets ${status}` })).toBeTruthy();
      fireEvent.click(screen.getByRole("checkbox", { name: "Doors" }));
      expect(screen.getByRole("checkbox", { name: "All categories" })).toHaveProperty("checked", false);
      expect(screen.queryByRole("button", { name: `Inspect Doors ${status}` })).toBeNull();
      expect(screen.getByRole("button", { name: `Inspect Lights ${status}` })).toBeTruthy();
      fireEvent.change(categorySearch, { target: { value: "missing category" } });
      expect(screen.getByText("No categories match your search.")).toBeTruthy();
      fireEvent.change(categorySearch, { target: { value: "" } });
      expect(screen.getByRole("checkbox", { name: "Cabinets" })).toHaveProperty("checked", true);
      expect(screen.getByRole("checkbox", { name: "Doors" })).toHaveProperty("checked", false);
      fireEvent.click(screen.getByRole("checkbox", { name: "Doors" }));
      expect(screen.getByRole("checkbox", { name: "All categories" })).toHaveProperty("checked", true);
    }
  });
  it("edits and clears category IFC Class and System in a simple three-field pop-up", async () => {
    const f = fixture();
    render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
    fireEvent.click(await screen.findByRole("button", { name: "Categories" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Cabinets category" }));
    let dialog = screen.getByRole("dialog", { name: "Cabinets category" });
    expect(within(dialog).getAllByRole("textbox").map(input => input.closest("label")?.textContent)).toEqual(["Category name"]);
    expect(within(dialog).getAllByRole("combobox").map(input => input.getAttribute("aria-label"))).toEqual(["IFC Class", "System"]);
    expect(within(dialog).queryByText("Default upload mappings")).toBeNull();
    expect(within(dialog).queryByText("Confirmed field mappings")).toBeNull();
    expect(within(dialog).queryByText("Suggested source properties")).toBeNull();
    expect(within(dialog).getByLabelText("IFC Class")).toHaveProperty("value", "");
    chooseClassification("IFC Class", "IFCFURNITURE");
    chooseClassification("System", "5420 Brannalarmsystemer");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save category" }));
    await within(dialog).findByText("Category saved.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close dialog" }));
    const table = screen.getByRole("table", { name: "Generic Hard Asset categories" });
    expect(within(table).getByText("IFCFURNITURE")).toBeTruthy();
    expect(within(table).getByText("5420 Brannalarmsystemer")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Cabinets category" }));
    dialog = screen.getByRole("dialog", { name: "Cabinets category" });
    expect(within(dialog).getByLabelText("IFC Class")).toHaveProperty("value", "IFCFURNITURE");
    chooseClassification("IFC Class", "");
    chooseClassification("System", "");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save category" }));
    await within(dialog).findByText("Category saved.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close dialog" }));
    expect(within(table).getAllByRole("cell").map(cell => cell.textContent)).toEqual(["—", "—"]);
  });
  it("saves an asset directly to Library from an OBJ preview through the main upload dialog", async () => {
    const f = fixture();
    const category = required(f.getState().categories[0]);
    await f.api.execute({ kind: "category", expectedRevision: f.getState().revision, id: category.id,
      name: category.name, aliases: category.aliases, ifcClass: "IFCBUILDINGELEMENTPROXY", system: "5420 Brannalarmsystemer" });
    vi.mocked(f.api.execute).mockClear();
    let mesh: GeometryRecord | null = null;
    const meshApi: GeometryApi = {
      save: vi.fn<GeometryApi["save"]>(async input => { const saved = { ...input, id: "00000000-0000-4000-8000-000000000088" }; mesh = saved; return saved; }),
      read: vi.fn<GeometryApi["read"]>(async () => { if (!mesh) throw Error("No mesh"); return mesh; }),
    };
    const obj = "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n";
    const file = new File([obj], "Reference.obj");
    Object.defineProperty(file, "text", { value: async () => obj });
    render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} meshApi={meshApi}
      loadViewer={async () => ({ default: () => <div>Imported mesh preview</div> })} />);
    fireEvent.click(required((await screen.findAllByRole("button", { name: "Create asset" }))[0]));
    const files = screen.getByLabelText("3D model files");
    expect(files.getAttribute("accept")).toContain(".glb,.gltf,.obj,.stl");
    fireEvent.change(files, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Preview model" }));
    const dialog = await screen.findByRole("dialog", { name: "Create asset from 3D model" });
    await within(dialog).findByText("Imported mesh preview", {}, { timeout: 5000 });
    expect(meshApi.save).not.toHaveBeenCalled();
    expect(f.api.execute).not.toHaveBeenCalled();
    chooseClassification("Asset category", category.name);
    fireEvent.change(screen.getByLabelText("Asset name"), { target: { value: "Reference asset" } });
    expect(screen.getByLabelText("IFC Class")).toHaveProperty("value", "IFCBUILDINGELEMENTPROXY");
    expect(screen.getByLabelText("IFC Class")).toHaveProperty("readOnly", true);
    expect(screen.getByLabelText("System")).toHaveProperty("value", "5420 Brannalarmsystemer");
    expect(screen.getByLabelText("System")).toHaveProperty("readOnly", true);
    expect(screen.queryByLabelText("FDVU Documentation")).toBeNull();
    expect(screen.queryByText(/Detected properties/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save asset" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const created = f.getState().entries.find(entry => entry.definition.name === "Reference asset");
    expect(created).toMatchObject({ status: "draft", sourceReferences: [], definition: { categoryId: required(f.getState().categories[0]).id }, geometryReference: { kind: "mesh", geometryId: "00000000-0000-4000-8000-000000000088" } });
    expect(created?.definition).toMatchObject({ fdvuDocumentationUrl: "", specifications: {
      "IFC Class": { kind: "text", value: "IFCBUILDINGELEMENTPROXY", unit: null }, System: { kind: "text", value: "5420 Brannalarmsystemer", unit: null },
    } });
    expect(f.sources.upload).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Inspect Reference asset" }));
    await screen.findByText("Imported mesh preview");
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
  });
  it("offers direct asset uploads without a review workspace", async () => {
    const f = fixture(true);
    render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
    await screen.findByRole("button", { name: "Inspect Cabinet" });
    expect(screen.queryByRole("button", { name: "Sources" })).toBeNull();
    expect(screen.queryByLabelText("Source")).toBeNull();
    expect(screen.getByRole("button", { name: "Create asset" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Needs review" })).toBeNull();
  });
  it("previews uploaded IFC geometry before saving and retains the approved asset definition", async () => {
    const f = fixture(true);
    const original = structuredClone(required(f.getState().entries[0]));
    const model = sourceModel();
    model.id = "00000000-0000-4000-8000-000000000099";
    model.name = "Replacement.ifc";
    model.fingerprint = "replacement";
    model.creationIndex = { schemaVersion: 1, modelId: model.id, fingerprint: model.fingerprint,
      candidates: [
        { key: "type:replacement", identity: { kind: "type", globalId: "replacement" }, name: "Replacement cabinet", ifcClass: "IFCWALLTYPE", categories: [], classificationIssues: [], occurrenceIds: [99], representativeId: 99 },
        { key: "type:empty", identity: { kind: "type", globalId: "empty" }, name: "Empty geometry", ifcClass: "IFCWALLTYPE", categories: [], classificationIssues: [], occurrenceIds: [100], representativeId: 100 },
      ],
      stats: { elements: 2, candidates: 2, classified: 0, unclassified: 2, untyped: 0 },
    };
    let uploaded = false;
    f.sources.upload = vi.fn(async () => { uploaded = true; return model; });
    f.sources.list = vi.fn(async () => uploaded ? [model] : []);
    f.sources.saveCreationIndex = vi.fn(async index => index);
    const geometry = { meshes: [{ positions: new Float32Array([0, 0, 0]), normals: new Float32Array([0, 1, 0]), indices: new Uint32Array([0]), transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], color: [1, 1, 1, 1] }] };
    const pendingGeometry = deferred<typeof geometry>();
    render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} createWorker={() => ({
      ...previewWorker(model), readGeometry: vi.fn(async ({ elementId }) => elementId === 100 ? { meshes: [] } : pendingGeometry.promise),
    })} loadViewer={async () => ({ default: () => <div>Replacement geometry preview</div> })} />);
    fireEvent.click(await screen.findByRole("button", { name: "Inspect Cabinet" }));
    expect(screen.queryByRole("button", { name: "Compare duplicates" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Split variants" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Archive definition" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Update geometry" }));
    fireEvent.change(screen.getByLabelText("3D model files"), { target: { files: [new File(["IFC"], "Replacement.ifc")] } });
    await screen.findByLabelText("Geometry asset");
    const uploadDialog = screen.getByRole("dialog", { name: "Update geometry" });
    expect(within(uploadDialog).getByRole("button", { name: "Save geometry" })).toHaveProperty("disabled", true);
    expect(f.api.execute).not.toHaveBeenCalled();
    await act(async () => pendingGeometry.resolve(geometry));
    await within(uploadDialog).findByText("Replacement geometry preview");
    expect(f.getState().entries[0]).toEqual(original);
    fireEvent.change(screen.getByLabelText("Geometry asset"), { target: { value: "type:empty" } });
    await within(uploadDialog).findByText(/This asset has no preview geometry/);
    expect(within(uploadDialog).getByRole("button", { name: "Save geometry" })).toHaveProperty("disabled", true);
    expect(f.api.execute).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Geometry asset"), { target: { value: "type:replacement" } });
    await within(uploadDialog).findByText("Replacement geometry preview");
    fireEvent.click(screen.getByRole("button", { name: "Save geometry" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Update geometry" })).toBeNull());
    const entry = required(f.getState().entries[0]);
    expect(entry.definition).toEqual(original.definition);
    expect(entry.publication).toEqual(original.publication);
    expect(entry.status).toBe("approved");
    expect(entry.sourceReferences).toEqual(original.sourceReferences);
    expect(entry.geometryReference).toEqual({ modelId: model.id, fingerprint: model.fingerprint, candidateKey: "type:replacement", occurrenceId: 99 });
    expect(f.getState().entries).toHaveLength(1);
    expect(f.sources.upload).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Replacement geometry preview")).toBeTruthy();
  });
  it("keeps Library cards free of parameters and shows IFC Class and System in the inspector", async () => {
    const f = fixture(true);
    const state = structuredClone(f.getState());
    const source = state.sources[0];
    if (!source) throw Error("Missing fixture source");
    source.observation.fields.push({
      key: "system", name: "System", pset: "HEMY-ALPHANUMERIC", measure: "IfcLabel", unit: null,
      values: [{ rawValue: "5420 Fire Alarm Systems", normalized: { kind: "text", value: "5420 Fire Alarm Systems", unit: null }, occurrenceIds: [1, 2] }],
    });
    f.api.read = vi.fn(async () => state);
    render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
    const card = await screen.findByRole("button", { name: "Inspect Cabinet" });
    expect(within(card).queryByText("IFC Class")).toBeNull();
    expect(within(card).queryByText("System")).toBeNull();
    expect(within(card).queryByText("5420 Fire Alarm Systems")).toBeNull();
    expect(within(card).queryByText("0.6 m")).toBeNull();
    expect(within(card).getByRole("img", { name: "Fire-related asset" }).textContent).toBe("🔥");
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("img", { name: "Fire-related asset" })).toBeTruthy();
    fireEvent.click(card);
    const inspector = screen.getByRole("complementary", { name: "Definition inspector" });
    expect(within(inspector).getByText("IFCFURNITURETYPE")).toBeTruthy();
    expect(within(inspector).getByText("5420 Fire Alarm Systems")).toBeTruthy();
    expect(inspector.querySelectorAll(".definition-specs dt")).toHaveLength(2);
    expect(within(inspector).queryByText("FDVU Documentation")).toBeNull();
    expect(inspector.querySelector("h2")?.textContent).toBe("🔥 Cabinet");
    fireEvent.click(screen.getByRole("button", { name: "Preview Cabinet" }));
    const popup = screen.getByRole("dialog", { name: "Definition preview" });
    expect(within(popup).queryByRole("heading", { name: "Definition preview" })).toBeNull();
    expect(popup.querySelector("h2")?.textContent).toBe("🔥 Cabinet");
    expect(within(popup).getByRole("button", { name: "Close dialog" })).toBeTruthy();
  });
  it("uses the first approved definition per type name without a source selector", async () => {
    const f = fixture(true);
    const duplicate = structuredClone(snapshot);
    duplicate.modelId = "second-model";
    await f.api.execute({ kind: "import", expectedRevision: f.getState().revision, snapshot: duplicate });
    const second = f.getState().entries[1];
    if (!second) throw Error("Missing duplicate");
    await f.api.execute({ kind: "edit", expectedRevision: f.getState().revision, entryId: second.id,
      definition: { ...second.definition, specifications: { width: { kind: "number", value: 1.2, unit: "m" } } },
    });
    await f.api.execute({ kind: "approve", expectedRevision: f.getState().revision, entryIds: [second.id] });
    render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
    fireEvent.click(await screen.findByRole("button", { name: "Inspect Cabinet" }));
    const inspector = screen.getByRole("complementary", { name: "Definition inspector" });
    expect(within(inspector).getByText("IFCFURNITURETYPE")).toBeTruthy();
    expect(within(inspector).queryByText("1.2 m")).toBeNull();
    expect(screen.queryByLabelText("Source definition")).toBeNull();
    expect(screen.queryByText(/2 definitions/)).toBeNull();
    expect(f.getState().entries).toHaveLength(2);
  });


  it("hides source evidence in the approved Library while preserving it", async () => {
    const f = fixture(true);
    render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
    fireEvent.click(await screen.findByRole("button", { name: "Inspect Cabinet" }));
    expect(screen.queryByText("Source details")).toBeNull();
    expect(screen.queryByText("Source observations and conflicts")).toBeNull();
    expect(screen.queryByText("Source references and original values")).toBeNull();
    expect(screen.queryByText("Read-only properties")).toBeNull();
    expect(screen.queryByText(/Dimensions \/ Width:/)).toBeNull();
    expect(f.getState().entries[0]?.sourceReferences).toHaveLength(1);
    expect(f.getState().sources[0]?.observation.fields[0]?.key).toBe("width");
  });



  it("returns centered preview focus to its arrow after replacing a side inspector", async () => {
    const f = fixture(true);
    render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
    const card = await screen.findByRole("button", { name: "Inspect Cabinet" });
    card.focus();
    fireEvent.click(card);
    const arrow = screen.getByRole("button", { name: "Preview Cabinet" });
    arrow.focus();
    fireEvent.click(arrow);
    fireEvent(
      screen.getByRole("dialog", { name: "Definition preview" }),
      new Event("cancel", { cancelable: true }),
    );
    expect(document.activeElement).toBe(arrow);
  });
  it("retains hidden-source definitions and selects the card when opening its centered preview", async () => {
    const f = fixture(true);
    render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Preview Cabinet" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Definition preview",
    });
    expect(
      screen
        .getByRole("button", { name: "Inspect Cabinet" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(within(dialog).getByText("IFCFURNITURETYPE")).toBeTruthy();
    expect(
      await within(dialog).findByText(/No current geometry source/),
    ).toBeTruthy();
  });
});

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
it("preserves existing aliases, upload defaults and specification mappings when editing basic category values", async () => {
  const f = fixture();
  const category = required(f.getState().categories[0]);
  const defaults = { name: "asset-name", ifcClass: "ifc-class", system: "width", fdvuDocumentationUrl: "" };
  await f.api.execute({ kind: "category", expectedRevision: f.getState().revision, id: category.id, name: category.name, aliases: ["Casework"], uploadMappings: defaults });
  const mappings = [{ key: "width", label: "Width", dataKind: "number", canonicalUnit: "m", role: "specification" }] satisfies CatalogLibrary["templates"][number]["mappings"];
  await f.api.execute({ kind: "template", expectedRevision: f.getState().revision, categoryId: category.id, mappings });
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  fireEvent.click(await screen.findByRole("button", { name: "Categories" }));
  fireEvent.click(screen.getByRole("button", { name: "Open Cabinets category" }));
  fireEvent.change(screen.getByLabelText("Category name"), { target: { value: "Cabinet equipment" } });
  chooseClassification("IFC Class", "IFCFURNITURE");
  fireEvent.click(screen.getByRole("button", { name: "Save category" }));
  await screen.findByText("Category saved.");
  expect(f.getState().categories[0]).toMatchObject({ name: "Cabinet equipment", aliases: ["Casework", "Cabinets"], uploadMappings: defaults, ifcClass: "IFCFURNITURE" });
  expect(f.getState().templates[0]?.mappings).toEqual(mappings);
});
it("preserves unconfirmed product hints without exposing a definition kind control", async () => {
  const f = fixture();
  const entry = required(f.getState().entries[0]);
  await f.api.execute({ kind: "edit", expectedRevision: f.getState().revision,
    entryId: entry.id, definition: { ...entry.definition, kind: "product" } });
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Inspect Cabinet" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit definition" }));
  expect(screen.queryByLabelText("Kind")).toBeNull();
  fireEvent.change(screen.getByLabelText("Manufacturer"), {
    target: { value: "Example" },
  });
  fireEvent.change(screen.getByLabelText("Model"), {
    target: { value: "600" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save definition" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(f.getState().entries[0]?.definition.manufacturer.confirmed).toBe(
    false,
  );
  expect(screen.getByRole("button", { name: "Inspect Cabinet" })).toBeTruthy();
});
it("refreshes a stale catalog conflict while preserving unsaved editor values", async () => {
  const f = fixture();
  const api: CatalogApi = {
    read: f.api.read,
    execute: vi.fn(async () => {
      throw new CatalogRequestError(
        "REVISION_CONFLICT",
        "Catalog changed; review your edit.",
      );
    }),
  };
  render(<CatalogWorkspace catalogApi={api} sourceApi={f.sources} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Inspect Cabinet" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit definition" }));
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Unsaved custom name" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save definition" }));
  await waitFor(() => expect(f.api.read).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText("Name")).toHaveProperty(
    "value",
    "Unsaved custom name",
  );
  expect(
    within(screen.getByRole("dialog")).getByRole("alert").textContent,
  ).toContain("Catalog changed");
});
it("requires explicit analysis, reports worker progress and cancels late replies", async () => {
  const f = fixture();
  const model = sourceModel();
  f.sources.list = vi.fn(async () => [model]);
  f.sources.saveIndex = vi.fn(async () => requireIndex(model));
  const pending = deferred<LibrarySnapshot>();
  const worker: AnalysisWorker = {
    openModel: vi.fn(async () => model.index!),
    analyzeLibrary: vi.fn(({ onProgress }) => {
      onProgress?.("Analyzing 1 of 2 occurrences");
      return pending.promise;
    }),
    dispose: vi.fn(),
  };
  const view = renderHook(() => useSourceAnalysis(() => worker, f.sources,
    async snapshot => { await f.api.execute({ kind: "import", expectedRevision: f.getState().revision, snapshot }); return true; },
  ));
  expect(worker.analyzeLibrary).not.toHaveBeenCalled();
  act(() => { void view.result.current.analyze(model); });
  await waitFor(() => expect(view.result.current.progress).toBe("Analyzing 1 of 2 occurrences"));
  act(() => view.result.current.cancel());
  await act(async () => pending.resolve(snapshot));
  expect(f.api.execute).not.toHaveBeenCalled();
  expect(worker.dispose).toHaveBeenCalled();
  view.unmount();
});
it("imports analyzed observations only after the explicit source action", async () => {
  const f = fixture();
  const model = sourceModel();
  f.sources.list = vi.fn(async () => [model]);
  f.sources.saveIndex = vi.fn(async () => model.index!);
  const worker: AnalysisWorker = {
    openModel: vi.fn(async () => model.index!),
    analyzeLibrary: vi.fn(async () => snapshot),
    dispose: vi.fn(),
  };
  const view = renderHook(() => useSourceAnalysis(() => worker, f.sources,
    async snapshot => { await f.api.execute({ kind: "import", expectedRevision: f.getState().revision, snapshot }); return true; },
  ));
  await act(() => view.result.current.analyze(model));
  await waitFor(() =>
    expect(f.api.execute).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "import", snapshot }),
    ),
  );
  expect(worker.dispose).toHaveBeenCalled();
});
function sourceModel(): LibraryModel {
  return {
    id: "model",
    name: "Furniture.ifc",
    source: "existing",
    fingerprint: "v1",
    size: 100,
    modifiedAt: "2026-10-06T00:00:00Z",
    index: {
      schemaVersion: 1,
      modelId: "model",
      fingerprint: "v1",
      stats: { elements: 2, classified: 2, excluded: 0, untyped: 0 },
      types: [
        {
          id: "source-type",
          modelId: "model",
          typeGlobalId: "cabinet",
          name: "Cabinet",
          ifcClass: "IFCFURNITURETYPE",
          categories: ["Cabinets"],
          occurrenceIds: [1, 2],
          representativeId: 1,
        },
      ],
    },
  };
}
function previewWorker(model: LibraryModel): LibraryWorker {
  return {
    discoverAssets: vi.fn(async () => {
      if (!model.creationIndex) throw Error("No creation index");
      return model.creationIndex;
    }),
    openModel: vi.fn(async () => {
      if (!model.index) throw new Error("No index");
      return model.index;
    }),
    readProperties: vi.fn(async () => []),
    readGeometry: vi.fn(async () => ({ meshes: [] })),
    dispose: vi.fn(),
  };
}
it("blocks changed source identity before geometry and keeps curated parameters", async () => {
  const f = fixture(true);
  const model = sourceModel();
  model.fingerprint = "replacement";
  if (model.index) model.index.fingerprint = "replacement";
  f.sources.list = vi.fn(async () => [model]);
  const worker = previewWorker(model);
  render(
    <CatalogWorkspace
      catalogApi={f.api}
      sourceApi={f.sources}
      createWorker={() => worker}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Inspect Cabinet" }),
  );
  await screen.findByText(/No current geometry source/);
  expect(worker.openModel).not.toHaveBeenCalled();
  expect(screen.getAllByText("IFCFURNITURETYPE").length).toBeGreaterThan(0);
});




function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing test fixture");
  return value;
}
function requireIndex(model: LibraryModel) {
  if (!model.index) throw new Error("Missing fixture index");
  return model.index;
}

it("ignores late analysis after unmount and disposes its dedicated worker", async () => {
  const model = sourceModel(),
    pending = deferred<LibrarySnapshot>();
  const worker: AnalysisWorker = {
    openModel: vi.fn(async () => requireIndex(model)),
    analyzeLibrary: vi.fn(() => pending.promise),
    dispose: vi.fn(),
  };
  const f = fixture();
  const save = vi.fn(async () => true);
  const hook = renderHook(() =>
    useSourceAnalysis(() => worker, f.sources, save),
  );
  let request: Promise<void> = Promise.resolve();
  act(() => {
    request = hook.result.current.analyze(model);
  });
  await waitFor(() => expect(worker.analyzeLibrary).toHaveBeenCalled());
  hook.unmount();
  await act(async () => {
    pending.resolve(snapshot);
    await request;
  });
  expect(save).not.toHaveBeenCalled();
  expect(worker.dispose).toHaveBeenCalled();
});
it("does not let a stale catalog refresh replace a later saved decision", async () => {
  const f = fixture();
  const delayed = deferred<CatalogLibrary>();
  const read = vi
    .fn<() => Promise<CatalogLibrary>>()
    .mockResolvedValueOnce(f.getState())
    .mockImplementationOnce(() => delayed.promise);
  const api = { read, execute: f.api.execute };
  const hook = renderHook(() => useCatalogLibrary(api));
  await waitFor(() => expect(hook.result.current.state).not.toBeNull());
  let refresh: Promise<void> = Promise.resolve();
  act(() => {
    refresh = hook.result.current.refresh();
  });
  const entry = required(f.getState().entries[0]);
  await act(async () => {
    await hook.result.current.execute({
      kind: "edit",
      entryId: entry.id,
      definition: { ...entry.definition, name: "Later staff decision" },
    });
  });
  await act(async () => {
    delayed.resolve(emptyCatalogLibrary());
    await refresh;
  });
  expect(hook.result.current.state?.entries[0]?.definition.name).toBe(
    "Later staff decision",
  );
});
it("tries only equivalent fallback references and uses the preferred occurrence first", async () => {
  const f = fixture(true);
  await f.api.execute({
    kind: "import",
    expectedRevision: f.getState().revision,
    snapshot: { ...snapshot, modelId: "other", sourceName: "Other.ifc" },
  });
  const target = required(f.getState().entries[0]),
    other = required(f.getState().entries[1]);
  await f.api.execute({
    kind: "merge",
    expectedRevision: f.getState().revision,
    targetId: target.id,
    absorbedIds: [other.id],
  });
  let entry = required(f.getState().entries[0]);
  const model = sourceModel();
  const alternate = {
    ...model,
    id: "other",
    name: "Other.ifc",
    index: {
      ...requireIndex(model),
      modelId: "other",
      types: requireIndex(model).types.map((t) => ({ ...t, modelId: "other" })),
    },
  };
  const api: LibraryApi = {
    ...f.sources,
    list: vi.fn(async () => [alternate]),
  };
  const worker = previewWorker(alternate);
  const create = () => worker;
  const hook = renderHook(
    ({ entry: current }) =>
      useDefinitionPreview(f.getState(), current, api, create),
    { initialProps: { entry } },
  );
  await waitFor(() =>
    expect(hook.result.current.message).toContain("No current geometry source"),
  );
  expect(worker.openModel).not.toHaveBeenCalled();
  entry = {
    ...entry,
    sourceReferences: entry.sourceReferences.map((r, i) => ({
      ...r,
      equivalent: i === 1,
      occurrenceIds: [2, 1],
    })),
  };
  hook.rerender({ entry });
  await waitFor(() => expect(worker.readGeometry).toHaveBeenCalled());
  expect(worker.readGeometry).toHaveBeenNthCalledWith(1, {
    modelId: "other",
    elementId: 2,
  });
  hook.unmount();
  expect(worker.dispose).toHaveBeenCalled();
});
it("retains approved definitions but refreshes availability after hiding a source", async () => {
  const f = fixture(true);
  let models = [sourceModel()];
  f.sources.list = vi.fn(async () => models);
  f.sources.hide = vi.fn(async () => {
    models = [];
  });
  const worker = previewWorker(sourceModel());
  const create = () => worker;
  render(
    <CatalogWorkspace
      catalogApi={f.api}
      sourceApi={f.sources}
      createWorker={create}
    />,
  );
  await screen.findByText("Geometry available");
  await f.sources.hide("model");
  fireEvent.click(screen.getByRole("button", { name: "Library" }));
  await screen.findByRole("button", { name: "Inspect Cabinet" });
  await screen.findByText("Geometry unavailable");
  expect(f.getState().entries[0]?.status).toBe("approved");
});



it("keeps the approved definition usable and source details hidden when the lazy viewer fails and retries locally", async () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const f = fixture(true),
      model = sourceModel();
    f.sources.list = vi.fn(async () => [model]);
    const worker = previewWorker(model);
    worker.readGeometry = vi.fn(async () => ({
      meshes: [
        {
          positions: new Float32Array([0, 0, 0]),
          normals: new Float32Array([0, 1, 0]),
          indices: new Uint32Array([0]),
          transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          color: [1, 1, 1, 1],
        },
      ],
    }));
    worker.readProperties = vi.fn<LibraryWorker["readProperties"]>(async () => [
      {
        name: "Raw fixture properties",
        source: "instance",
        values: [{ name: "Asset code", value: "REAL-42" }],
      },
    ]);
    const loadViewer = vi
      .fn<ViewerLoader>()
      .mockRejectedValueOnce(new Error("Viewer chunk unavailable"))
      .mockResolvedValueOnce({
        default: () => <div>Recovered catalog viewer</div>,
      });
    render(
      <CatalogWorkspace
        catalogApi={f.api}
        sourceApi={f.sources}
        createWorker={() => worker}
        loadViewer={loadViewer}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Inspect Cabinet" }),
    );
    await screen.findByRole("button", { name: "Retry viewer download" });
    expect(
      screen.getByRole("button", { name: "Edit definition" }),
    ).toBeTruthy();
    expect(screen.queryByText("REAL-42")).toBeNull();
    expect(screen.getAllByText("IFCFURNITURETYPE").length).toBeGreaterThan(0);
    fireEvent.click(
      screen.getByRole("button", { name: "Retry viewer download" }),
    );
    await screen.findByText("Recovered catalog viewer");
    expect(loadViewer).toHaveBeenCalledTimes(2);
  } finally {
    consoleError.mockRestore();
  }
});
it("rejects a changed type returned during source opening before reading geometry", async () => {
  const f = fixture(true),
    model = sourceModel();
  f.sources.list = vi.fn(async () => [model]);
  const worker = previewWorker(model);
  worker.openModel = vi.fn(async () => ({
    ...requireIndex(model),
    types: requireIndex(model).types.map((t) => ({
      ...t,
      typeGlobalId: "different-type",
    })),
  }));
  const entry = required(f.getState().entries[0]);
  const create = () => worker;
  const hook = renderHook(() =>
    useDefinitionPreview(f.getState(), entry, f.sources, create),
  );
  await waitFor(() =>
    expect(hook.result.current.message).toContain("Review and rebind"),
  );
  expect(worker.readGeometry).not.toHaveBeenCalled();
  hook.unmount();
});

it("preserves numeric units through a blank edit and records zero as a number", async () => {
  const f = fixture(true);
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Inspect Cabinet" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit definition" }));
  const input = screen.getByRole("spinbutton");
  fireEvent.change(input, { target: { value: "" } });
  fireEvent.change(input, { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Save definition" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(f.getState().entries[0]?.definition.specifications.width).toEqual({
    kind: "number",
    value: 0,
    unit: "m",
  });
});

it("locks the submitted edit while a delayed successful save is pending", async () => {
  const f = fixture(),
    pending = deferred<CatalogLibrary>();
  const api: CatalogApi = {
    read: f.api.read,
    execute: vi.fn(() => pending.promise),
  };
  render(<CatalogWorkspace catalogApi={api} sourceApi={f.sources} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Inspect Cabinet" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit definition" }));
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Submitted name" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save definition" }));
  expect(screen.getByLabelText("Name").matches(":disabled")).toBe(true);
  expect(screen.getByLabelText("Category").matches(":disabled")).toBe(true);
  const entry = required(f.getState().entries[0]);
  const result = await f.api.execute({
    kind: "edit",
    expectedRevision: f.getState().revision,
    entryId: entry.id,
    definition: { ...entry.definition, name: "Submitted name" },
  });
  await act(async () => pending.resolve(result));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(f.getState().entries[0]?.definition.name).toBe("Submitted name");
});
it(
  "shows edit rejection inside the active native modal and keeps it open",
  async () => {
    const f = fixture();
    const api: CatalogApi = {
      read: f.api.read,
      execute: vi.fn(async () => {
        throw new CatalogRequestError("REVISION_CONFLICT", "Catalog changed. Refresh before saving.");
      }),
    };
    render(<CatalogWorkspace catalogApi={api} sourceApi={f.sources} />);
    fireEvent.click(await screen.findByRole("button", { name: "Preview Cabinet" }));
    let dialog = screen.getByRole("dialog", { name: "Definition preview" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Edit definition" }));
    dialog = screen.getByRole("dialog", { name: "Edit definition" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save definition" }));
    expect((await within(dialog).findByRole("alert")).textContent).toContain("Catalog changed");
    expect(dialog).toHaveProperty("open", true);
    expect(f.getState().entries[0]?.status).toBe("draft");
  },
);
it("keeps existing drafts editable in Library without archive controls", async () => {
  const f = fixture();
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  fireEvent.click(await screen.findByRole("button", { name: "Inspect Cabinet" }));
  expect(screen.queryByRole("button", { name: "Needs review" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
  expect(screen.queryByRole("checkbox", { name: "Show archived" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Archive asset" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Restore asset" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit definition" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Generic cabinet" } });
  fireEvent.click(screen.getByRole("button", { name: "Save definition" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("button", { name: "Inspect Generic cabinet" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Preview Generic cabinet" }));
  const preview = screen.getByRole("dialog", { name: "Definition preview" });
  expect(within(preview).queryByRole("button", { name: "Archive asset" })).toBeNull();
  expect(within(preview).queryByRole("button", { name: "Restore asset" })).toBeNull();
});
it("limits Library parameters while retaining category mappings in the editor", async () => {
  const f = fixture(true);
  await f.api.execute({
    kind: "import",
    expectedRevision: f.getState().revision,
    snapshot: {
      ...snapshot,
      modelId: "second",
      sourceName: "Door.ifc",
      types: snapshot.types.map((t) => ({
        ...t,
        name: "Door",
        categories: ["Doors"],
      })),
    },
  });
  for (const category of f.getState().categories)
    await f.api.execute({
      kind: "template",
      expectedRevision: f.getState().revision,
      categoryId: category.id,
      mappings: [
        {
          key: "width",
          label: category.name === "Doors" ? "Clear opening" : "Cabinet width",
          dataKind: "number",
          canonicalUnit: "m",
          role: "specification",
        },
      ],
    });
  const door = required(
    f.getState().entries.find((e) => e.definition.name === "Door"),
  );
  await f.api.execute({
    kind: "approve",
    expectedRevision: f.getState().revision,
    entryIds: [door.id],
  });
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  expect(
    await within(
      await screen.findByRole("button", { name: "Inspect Door" }),
    ).queryByText("IFC Class"),
  ).toBeNull();
  expect(
    within(screen.getByRole("button", { name: "Inspect Cabinet" })).queryByText(
      "System",
    ),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Inspect Door" }));
  const inspector = screen.getByRole("complementary", {
    name: "Definition inspector",
  });
  expect(
    within(inspector).queryByText("Clear opening"),
  ).toBeNull();
  expect(within(inspector).queryByText("Cabinet width")).toBeNull();
  fireEvent.click(
    within(inspector).getByRole("button", { name: "Edit definition" }),
  );
  expect(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Use source value Clear opening: 0.6 m",
    }),
  ).toBeTruthy();
});
it("replaces cached availability with unknown on failed inventory refresh and retries", async () => {
  const f = fixture(true);
  let unavailable = false;
  f.sources.list = vi.fn(async () => {
    if (unavailable) throw new Error("Inventory connection lost");
    return [sourceModel()];
  });
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  await screen.findByText("Geometry available");
  unavailable = true;
  fireEvent.click(screen.getByRole("button", { name: "Library" }));
  await screen.findByRole("button", { name: "Retry source availability" });
  expect(screen.queryByText("Geometry available")).toBeNull();
  expect(screen.getByText("Geometry availability unknown")).toBeTruthy();
  unavailable = false;
  fireEvent.click(
    screen.getByRole("button", { name: "Retry source availability" }),
  );
  await screen.findByText("Geometry available");
  expect(
    screen.queryByRole("button", { name: "Retry source availability" }),
  ).toBeNull();
});





describe("final review workflow regressions", () => {


  it("retains server-added aliases when saving a renamed category again", async () => {
    const f = fixture();
    render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
    fireEvent.click(await screen.findByRole("button", { name: "Categories" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Cabinets category" }));
    fireEvent.change(screen.getByLabelText("Category name"), {
      target: { value: "Casework" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save category" }),
    );
    await screen.findByText("Category saved.");
    fireEvent.click(
      screen.getByRole("button", { name: "Save category" }),
    );
    await waitFor(() => expect(f.api.execute).toHaveBeenCalledTimes(2));
    expect(f.getState().categories[0]?.aliases).toContain("Cabinets");
  });

});
