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
    upload: vi.fn(),
  };
  return { api, sources, getState: () => state };
}
describe("curated catalog", () => {
  it("lands on approved definitions and exposes real draft review", async () => {
    const f = fixture();
    render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
    await screen.findByText("Your approved library starts here");
    expect(
      screen.queryByRole("button", { name: "Inspect Cabinet" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Needs review/ }));
    expect(
      await screen.findByRole("button", { name: "Inspect Cabinet" }),
    ).toBeTruthy();
  });
  it("edits and approves a persisted definition, then archives and restores it", async () => {
    const f = fixture();
    render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Needs review/ }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Inspect Cabinet" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit definition" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Wide cabinet" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Use source value Width: 0.6 m" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save definition" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Approve definition" }));
    await waitFor(() =>
      expect(f.getState().entries[0]?.status).toBe("approved"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Inspect Wide cabinet" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Archive definition" }));
    await waitFor(() =>
      expect(f.getState().entries[0]?.status).toBe("archived"),
    );
    fireEvent.click(screen.getByRole("button", { name: /Needs review/ }));
    fireEvent.click(screen.getByLabelText("Show archived"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Inspect Wide cabinet" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Restore draft" }));
    await waitFor(() => expect(f.getState().entries[0]?.status).toBe("draft"));
  });
  it("rejects incomplete batch approval and keeps drafts visible", async () => {
    const f = fixture();
    render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Needs review/ }),
    );
    fireEvent.click(await screen.findByLabelText("Select Cabinet"));
    fireEvent.click(
      screen.getByRole("button", { name: "Approve selected (1)" }),
    );
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(f.getState().entries[0]?.status).toBe("draft");
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
    expect(within(dialog).getByText("0.6 m")).toBeTruthy();
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
it("saves category aliases and confirmed variant mappings; rejects misleading units", async () => {
  const f = fixture();
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  fireEvent.click(await screen.findByRole("button", { name: "Categories" }));
  await waitFor(() => expect(f.getState().categories.length).toBe(1));
  fireEvent.change(screen.getByLabelText("Category to edit"), {
    target: { value: f.getState().categories[0]?.id },
  });
  fireEvent.change(screen.getByLabelText("Aliases, separated by commas"), {
    target: { value: "Casework, Cabinet units" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save category and aliases" }),
  );
  await screen.findByText("Category and aliases saved.");
  expect(f.getState().categories[0]?.aliases).toEqual([
    "Casework",
    "Cabinet units",
  ]);
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm mapping Width" }),
  );
  fireEvent.change(screen.getByLabelText("Canonical unit"), {
    target: { value: "mm" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save specification template" }),
  );
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("normalized in m"),
  );
  expect(f.getState().templates[0]?.mappings).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("Canonical unit"), {
    target: { value: "m" },
  });
  fireEvent.change(screen.getByLabelText("Field role"), {
    target: { value: "variant" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save specification template" }),
  );
  await screen.findByText("Specification template saved.");
  expect(f.getState().templates[0]?.mappings[0]?.role).toBe("variant");
});
it("does not confirm product hints when choosing product kind", async () => {
  const f = fixture();
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  fireEvent.click(await screen.findByRole("button", { name: "Needs review" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Inspect Cabinet" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit definition" }));
  fireEvent.change(screen.getByLabelText("Kind"), {
    target: { value: "product" },
  });
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
  fireEvent.click(screen.getByRole("button", { name: "Approve definition" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("confirmed manufacturer"),
  );
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
  fireEvent.click(await screen.findByRole("button", { name: "Needs review" }));
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
  const createWorker = () => previewWorker(model);
  const view = render(
    <CatalogWorkspace
      catalogApi={f.api}
      sourceApi={f.sources}
      createWorker={createWorker}
      createAnalysisWorker={() => worker}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Sources" }));
  expect(worker.analyzeLibrary).not.toHaveBeenCalled();
  fireEvent.click(
    await screen.findByRole("button", { name: "Analyze and import drafts" }),
  );
  await screen.findByText("Analyzing 1 of 2 occurrences");
  fireEvent.click(screen.getByRole("button", { name: "Cancel analysis" }));
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
  const createWorker = () => previewWorker(model);
  render(
    <CatalogWorkspace
      catalogApi={f.api}
      sourceApi={f.sources}
      createWorker={createWorker}
      createAnalysisWorker={() => worker}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Sources" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Analyze and import drafts" }),
  );
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
  expect(screen.getAllByText("0.6 m").length).toBeGreaterThan(0);
});
it("persists the staff-selected preferred occurrence", async () => {
  const f = fixture(true);
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Inspect Cabinet" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Preferred geometry" }));
  fireEvent.change(screen.getByLabelText("Preferred occurrence"), {
    target: { value: "2" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save preferred geometry" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(f.getState().entries[0]?.sourceReferences[0]?.occurrenceIds).toEqual([
    2, 1,
  ]);
  expect(f.getState().entries[0]?.status).toBe("draft");
});
it("shows duplicate differences and merges only after confirmation", async () => {
  const f = fixture();
  const other = {
    ...snapshot,
    modelId: "other",
    sourceName: "Other.ifc",
    types: snapshot.types.map((t) => ({
      ...t,
      fields: t.fields.map((field) => ({
        ...field,
        values: [
          {
            rawValue: "900",
            normalized: { kind: "number" as const, value: 0.9, unit: "m" },
            occurrenceIds: [1, 2],
          },
        ],
      })),
    })),
  };
  await f.api.execute({
    kind: "import",
    expectedRevision: f.getState().revision,
    snapshot: other,
  });
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  fireEvent.click(await screen.findByRole("button", { name: "Needs review" }));
  fireEvent.click(
    required(
      (await screen.findAllByRole("button", { name: "Inspect Cabinet" }))[0],
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Compare duplicates" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText("Width")).toBeTruthy();
  expect(f.getState().entries.filter((e) => e.status === "draft")).toHaveLength(
    2,
  );
  fireEvent.click(within(dialog).getByRole("checkbox"));
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Confirm merge" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(f.getState().entries.map((e) => e.status)).toEqual([
    "draft",
    "archived",
  ]);
  expect(f.getState().entries[0]?.sourceReferences).toHaveLength(2);
});
it("splits confirmed variant fields into independent drafts", async () => {
  const f = fixture();
  const changed = {
    ...snapshot,
    fingerprint: "v2",
    types: snapshot.types.map((t) => ({
      ...t,
      fields: t.fields.map((field) => ({
        ...field,
        values: [
          {
            rawValue: "600",
            normalized: { kind: "number" as const, value: 0.6, unit: "m" },
            occurrenceIds: [1],
          },
          {
            rawValue: "900",
            normalized: { kind: "number" as const, value: 0.9, unit: "m" },
            occurrenceIds: [2],
          },
        ],
      })),
    })),
  };
  await f.api.execute({
    kind: "import",
    expectedRevision: f.getState().revision,
    snapshot: changed,
  });
  const entry = required(f.getState().entries[0]);
  await f.api.execute({
    kind: "edit",
    expectedRevision: f.getState().revision,
    entryId: entry.id,
    definition: entry.definition,
    confirmedSourceReferences: entry.sourceReferences.map((r) => ({
      ...r,
      fingerprint: "v2",
    })),
  });
  await f.api.execute({
    kind: "template",
    expectedRevision: f.getState().revision,
    categoryId: required(entry.definition.categoryId ?? undefined),
    mappings: [
      {
        key: "width",
        label: "Width",
        dataKind: "number",
        canonicalUnit: "m",
        role: "variant",
      },
    ],
  });
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  fireEvent.click(await screen.findByRole("button", { name: "Needs review" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Inspect Cabinet" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Split variants" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByLabelText("Width"));
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm split into drafts" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(f.getState().entries.filter((e) => e.status === "draft")).toHaveLength(
    2,
  );
  expect(
    f
      .getState()
      .entries.filter((e) => e.status === "draft")
      .map((e) => e.sourceReferences[0]?.occurrenceIds),
  ).toEqual([[1], [2]]);
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
  fireEvent.click(screen.getByRole("button", { name: "Sources" }));
  fireEvent.click(await screen.findByRole("button", { name: "Remove model" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove from library" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(screen.getByRole("button", { name: "Library" }));
  await screen.findByRole("button", { name: "Inspect Cabinet" });
  await screen.findByText("Geometry unavailable");
  expect(f.getState().entries[0]?.status).toBe("approved");
});
it("clears batch selection when filters change", async () => {
  const f = fixture();
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  fireEvent.click(await screen.findByRole("button", { name: "Needs review" }));
  fireEvent.click(await screen.findByLabelText("Select Cabinet"));
  fireEvent.change(screen.getByLabelText("Search definitions"), {
    target: { value: "No match" },
  });
  fireEvent.change(screen.getByLabelText("Search definitions"), {
    target: { value: "" },
  });
  expect(
    await screen.findByRole("button", { name: "Approve selected (0)" }),
  ).toHaveProperty("disabled", true);
});

it("keeps source conflict evidence after saving an explicit specification override", async () => {
  const f = fixture();
  const changed = {
    ...snapshot,
    fingerprint: "v2",
    types: snapshot.types.map((t) => ({
      ...t,
      fields: t.fields.map((field) => ({
        ...field,
        values: [
          {
            rawValue: "600",
            normalized: { kind: "number" as const, value: 0.6, unit: "m" },
            occurrenceIds: [1],
          },
          {
            rawValue: "900",
            normalized: { kind: "number" as const, value: 0.9, unit: "m" },
            occurrenceIds: [2],
          },
        ],
      })),
    })),
  };
  await f.api.execute({
    kind: "import",
    expectedRevision: f.getState().revision,
    snapshot: changed,
  });
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  fireEvent.click(await screen.findByRole("button", { name: "Needs review" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Inspect Cabinet" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit definition" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Use source value Width: 0.6 m" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save definition" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText(/conflicting \(resolved by override\)/)).toBeTruthy();
  expect(f.getState().sources[0]?.observation.fields[0]?.values).toHaveLength(
    2,
  );
});
it("keeps definition and raw IFC details usable when the lazy viewer fails and retries locally", async () => {
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
    expect(screen.getByText("REAL-42")).toBeTruthy();
    expect(screen.getAllByText("0.6 m").length).toBeGreaterThan(0);
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
  fireEvent.click(await screen.findByRole("button", { name: "Needs review" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Inspect Cabinet" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit definition" }));
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Submitted name" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save definition" }));
  expect(screen.getByLabelText("Name").matches(":disabled")).toBe(true);
  expect(screen.getByLabelText("Kind").matches(":disabled")).toBe(true);
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
it.each(["approve", "archive", "edit", "geometry", "merge", "split"] as const)(
  "shows %s rejection inside the active native modal and keeps it open",
  async (action) => {
    const f = fixture();
    if (action === "merge")
      await f.api.execute({
        kind: "import",
        expectedRevision: f.getState().revision,
        snapshot: { ...snapshot, modelId: "other", sourceName: "Other.ifc" },
      });
    if (action === "split")
      await f.api.execute({
        kind: "template",
        expectedRevision: f.getState().revision,
        categoryId: required(f.getState().categories[0]).id,
        mappings: [
          {
            key: "width",
            label: "Width",
            dataKind: "number",
            canonicalUnit: "m",
            role: "variant",
          },
        ],
      });
    const api: CatalogApi = {
      read: f.api.read,
      execute: vi.fn(async () => {
        throw new CatalogRequestError(
          "PUBLICATION_INVALID",
          "Review required: rejected mutation.",
        );
      }),
    };
    render(<CatalogWorkspace catalogApi={api} sourceApi={f.sources} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Needs review" }),
    );
    fireEvent.click(
      required(
        (await screen.findAllByRole("button", { name: "Preview Cabinet" }))[0],
      ),
    );
    let dialog = screen.getByRole("dialog", { name: "Definition preview" });
    if (action === "approve" || action === "archive")
      fireEvent.click(
        within(dialog).getByRole("button", {
          name:
            action === "approve" ? "Approve definition" : "Archive definition",
        }),
      );
    else {
      const launch = {
        edit: "Edit definition",
        geometry: "Preferred geometry",
        merge: "Compare duplicates",
        split: "Split variants",
      }[action];
      fireEvent.click(within(dialog).getByRole("button", { name: launch }));
      const title = {
        edit: "Edit definition",
        geometry: "Choose preferred geometry",
        merge: "Compare and merge definitions",
        split: "Split specification variants",
      }[action];
      dialog = screen.getByRole("dialog", { name: title });
      if (action === "merge")
        fireEvent.click(within(dialog).getByRole("checkbox"));
      if (action === "split")
        fireEvent.click(within(dialog).getByLabelText("Width"));
      const submit = {
        edit: "Save definition",
        geometry: "Save preferred geometry",
        merge: "Confirm merge",
        split: "Confirm split into drafts",
      }[action];
      fireEvent.click(within(dialog).getByRole("button", { name: submit }));
    }
    expect(await within(dialog).findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("rejected mutation"),
    );
    expect(dialog).toHaveProperty("open", true);
    expect(f.getState().entries[0]?.status).toBe("draft");
  },
);
it("uses each category mapping for the same property key on cards, inspector and editor", async () => {
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
    ).findByText("Clear opening"),
  ).toBeTruthy();
  expect(
    within(screen.getByRole("button", { name: "Inspect Cabinet" })).getByText(
      "Cabinet width",
    ),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Inspect Door" }));
  const inspector = screen.getByRole("complementary", {
    name: "Definition inspector",
  });
  expect(
    within(inspector).getAllByText("Clear opening").length,
  ).toBeGreaterThan(0);
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
  fireEvent.click(screen.getByRole("button", { name: "Categories" }));
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

it("keeps category-specific labels in duplicate comparisons and raw labels in template source controls", async () => {
  const f = fixture();
  for (const modelId of ["door-a", "door-b"])
    await f.api.execute({
      kind: "import",
      expectedRevision: f.getState().revision,
      snapshot: {
        ...snapshot,
        modelId,
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
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  fireEvent.click(await screen.findByRole("button", { name: "Needs review" }));
  fireEvent.click(
    required(
      (await screen.findAllByRole("button", { name: "Inspect Door" }))[0],
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Compare duplicates" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getAllByText(/Source Clear opening:/)).toHaveLength(2);
  expect(within(dialog).queryByText(/Cabinet width/)).toBeNull();
  fireEvent.click(within(dialog).getByRole("button", { name: "Close dialog" }));
  fireEvent.click(screen.getByRole("button", { name: "Categories" }));
  fireEvent.change(screen.getByLabelText("Category to edit"), {
    target: {
      value: required(f.getState().categories.find((c) => c.name === "Doors"))
        .id,
    },
  });
  expect(screen.getByLabelText("Display label")).toHaveProperty(
    "value",
    "Clear opening",
  );
  expect(
    within(screen.getByLabelText("Source property")).getByRole("option", {
      name: "Dimensions / Width",
    }),
  ).toBeTruthy();
});
it("falls back to the raw source property name when the selected category has no mapping", async () => {
  const f = fixture();
  const cabinets = required(f.getState().categories[0]);
  await f.api.execute({
    kind: "template",
    expectedRevision: f.getState().revision,
    categoryId: cabinets.id,
    mappings: [
      {
        key: "width",
        label: "Cabinet width",
        dataKind: "number",
        canonicalUnit: "m",
        role: "specification",
      },
    ],
  });
  await f.api.execute({
    kind: "category",
    expectedRevision: f.getState().revision,
    id: "unmapped",
    name: "Unmapped",
    aliases: [],
  });
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  fireEvent.click(await screen.findByRole("button", { name: "Needs review" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Inspect Cabinet" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit definition" }));
  fireEvent.change(screen.getByLabelText("Category"), {
    target: { value: "unmapped" },
  });
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByRole("button", {
      name: "Use source value Width: 0.6 m",
    }),
  ).toBeTruthy();
  expect(within(dialog).queryByText("Cabinet width")).toBeNull();
});
it("explains a real incomplete approval rejection inside the arrow preview", async () => {
  const f = fixture();
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  fireEvent.click(await screen.findByRole("button", { name: "Needs review" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Preview Cabinet" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Definition preview" });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Approve definition" }),
  );
  expect(await within(dialog).findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("known reusable specification"),
  );
  expect(dialog).toHaveProperty("open", true);
  expect(f.getState().entries[0]?.status).toBe("draft");
});

describe("final review workflow regressions", () => {
  it("includes refreshed approved definitions in the review workspace", async () => {
    const f = fixture(true);
    await f.api.execute({
      kind: "import",
      expectedRevision: f.getState().revision,
      snapshot: { ...snapshot, fingerprint: "v2" },
    });
    render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Needs review" }),
    );
    expect(
      await screen.findByRole("button", { name: "Inspect Cabinet" }),
    ).toBeTruthy();
  });
  it("retains a split membership when acknowledging the unchanged geometry revision", async () => {
    const f = fixture(true);
    const entry = required(f.getState().entries[0]);
    entry.sourceReferences[0] = {
      ...required(entry.sourceReferences[0]),
      occurrenceIds: [2],
    };
    render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Inspect Cabinet" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Preferred geometry" }));
    fireEvent.click(
      screen.getByLabelText(
        "I reviewed the current source revision and its occurrence membership",
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save preferred geometry" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(f.getState().entries[0]?.sourceReferences[0]?.occurrenceIds).toEqual(
      [2],
    );
  });
  it("retains server-added aliases when saving a renamed category again", async () => {
    const f = fixture();
    render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
    fireEvent.click(await screen.findByRole("button", { name: "Categories" }));
    fireEvent.change(screen.getByLabelText("Category to edit"), {
      target: { value: required(f.getState().categories[0]).id },
    });
    fireEvent.change(screen.getByLabelText("Canonical category name"), {
      target: { value: "Casework" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save category and aliases" }),
    );
    await screen.findByText("Category and aliases saved.");
    fireEvent.click(
      screen.getByRole("button", { name: "Save category and aliases" }),
    );
    await waitFor(() => expect(f.api.execute).toHaveBeenCalledTimes(2));
    expect(f.getState().categories[0]?.aliases).toContain("Cabinets");
  });
  it("bounds review rendering and limits batch selection to the stated page", async () => {
    const f = fixture();
    const entry = required(f.getState().entries[0]);
    for (let i = 1; i < 65; i++)
      f.getState().entries.push({
        ...structuredClone(entry),
        id: "page-" + i,
        definition: { ...entry.definition, name: "Cabinet " + i },
      });
    render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Needs review" }),
    );
    expect(
      screen.getAllByRole("button", { name: /^Inspect Cabinet/ }),
    ).toHaveLength(50);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(
      screen.getAllByRole("button", { name: /^Inspect Cabinet/ }),
    ).toHaveLength(15);
    fireEvent.click(screen.getByLabelText("Select all 15 visible definitions"));
    expect(
      screen.getByRole("button", { name: "Approve selected (15)" }),
    ).toBeTruthy();
  });
});

it("selectively rebinds a refreshed variant without adding every occurrence", async () => {
  const f = fixture(true);
  const entry = required(f.getState().entries[0]);
  entry.sourceReferences[0] = {
    ...required(entry.sourceReferences[0]),
    occurrenceIds: [2],
  };
  const updated = {
    ...snapshot,
    fingerprint: "v2",
    types: snapshot.types.map((t) => ({
      ...t,
      occurrenceIds: [10, 11],
      fields: t.fields.map((field) => ({
        ...field,
        values: [
          {
            rawValue: "600",
            normalized: { kind: "number" as const, value: 0.6, unit: "m" },
            occurrenceIds: [10],
          },
          {
            rawValue: "900",
            normalized: { kind: "number" as const, value: 0.9, unit: "m" },
            occurrenceIds: [11],
          },
        ],
      })),
    })),
  };
  await f.api.execute({
    kind: "import",
    expectedRevision: f.getState().revision,
    snapshot: updated,
  });
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Inspect Cabinet" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Preferred geometry" }));
  fireEvent.click(
    screen.getByLabelText(
      "I reviewed the current source revision and its occurrence membership",
    ),
  );
  expect(
    screen.getByRole("button", { name: "Save preferred geometry" }),
  ).toHaveProperty("disabled", true);
  fireEvent.click(screen.getByLabelText("Include occurrence #10"));
  fireEvent.click(
    screen.getByRole("button", { name: "Save preferred geometry" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(f.getState().entries[0]?.sourceReferences[0]).toMatchObject({
    fingerprint: "v2",
    occurrenceIds: [10],
  });
});
it("selects an available preferred source while preserving its hidden historical reference", async () => {
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
  const old = required(f.getState().entries[0]?.sourceReferences[0]),
    visible = required(f.getState().entries[0]?.sourceReferences[1]);
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  fireEvent.click(await screen.findByRole("button", { name: "Needs review" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Inspect Cabinet" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Preferred geometry" }));
  fireEvent.change(screen.getByLabelText("Preferred source"), {
    target: { value: JSON.stringify([visible.sourceId, visible.fingerprint]) },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save preferred geometry" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(f.getState().entries[0]?.sourceReferences).toEqual([visible, old]);
});
it("assigns differently named source properties to one category parameter", async () => {
  const f = fixture();
  await f.api.execute({
    kind: "import",
    expectedRevision: f.getState().revision,
    snapshot: {
      ...snapshot,
      modelId: "other",
      types: snapshot.types.map((t) => ({
        ...t,
        fields: t.fields.map((field) => ({
          ...field,
          key: "overall",
          name: "Overall width",
        })),
      })),
    },
  });
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  fireEvent.click(await screen.findByRole("button", { name: "Categories" }));
  fireEvent.change(screen.getByLabelText("Category to edit"), {
    target: { value: required(f.getState().categories[0]).id },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm mapping Width" }),
  );
  const select = screen.getByLabelText("Source property");
  for (const option of within(select).getAllByRole("option")) {
    if (option instanceof HTMLOptionElement) option.selected = true;
  }
  fireEvent.change(select);
  fireEvent.click(
    screen.getByRole("button", { name: "Save specification template" }),
  );
  await screen.findByText("Specification template saved.");
  const mapping = required(f.getState().templates[0]?.mappings[0]);
  expect(mapping.key).not.toBe("width");
  expect(mapping.sourceKeys).toEqual(["width", "overall"]);
  expect(f.getState().templates[0]?.mappings).toHaveLength(1);
});

it("keeps current and historical source revision subsets distinct in geometry review", async () => {
  const f = fixture();
  const state = f.getState();
  const entry = required(state.entries[0]);
  const source = required(state.sources[0]);
  source.fingerprint = "v2";
  source.observation.occurrenceIds = [1, 2, 3];
  const old = required(entry.sourceReferences[0]);
  entry.sourceReferences = [
    { ...old, fingerprint: "v1", occurrenceIds: [2] },
    { ...old, fingerprint: "v2", occurrenceIds: [1] },
  ];
  render(<CatalogWorkspace catalogApi={f.api} sourceApi={f.sources} />);
  fireEvent.click(await screen.findByRole("button", { name: "Needs review" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Inspect Cabinet" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Preferred geometry" }));
  fireEvent.change(screen.getByLabelText("Preferred source"), {
    target: { value: JSON.stringify([old.sourceId, "v2"]) },
  });
  expect(
    screen.getByLabelText<HTMLSelectElement>("Preferred occurrence").value,
  ).toBe("1");
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "I reviewed the current source revision and its occurrence membership",
    }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Save preferred geometry" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(f.getState().entries[0]?.sourceReferences).toEqual([
    { ...old, fingerprint: "v2", occurrenceIds: [1] },
    { ...old, fingerprint: "v1", occurrenceIds: [2] },
  ]);

  fireEvent.click(screen.getByRole("button", { name: "Preferred geometry" }));
  fireEvent.change(screen.getByLabelText("Preferred source"), {
    target: { value: JSON.stringify([old.sourceId, "v1"]) },
  });
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "I reviewed the current source revision and its occurrence membership",
    }),
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Include occurrence #2" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Save preferred geometry" }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(f.getState().entries[0]?.sourceReferences).toEqual([
    { ...old, fingerprint: "v2", occurrenceIds: [2, 1] },
  ]);
});
