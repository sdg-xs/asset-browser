// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import type {
  CatalogIndex,
  LibraryModel,
  PropertyGroup,
} from "../shared/contracts.js";
import type { LibraryApi } from "../src/library/api.js";
import type { LibraryWorker } from "../src/library/useLibrary.js";
import { useLibrary } from '../src/library/useLibrary.js';
import { SourceRevisionError } from '../shared/revision.js';

afterEach(cleanup);
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
const modelId = "10000000-0000-4000-8000-000000000001";
const index: CatalogIndex = {
  schemaVersion: 1,
  modelId,
  fingerprint: "fixture",
  stats: { elements: 5, classified: 2, excluded: 2, untyped: 1 },
  types: [
    {
      id: "sensor",
      modelId,
      name: "Sensor type",
      typeGlobalId: "0000000000000000000042",
      ifcClass: "IFCBUILDINGELEMENTPROXYTYPE",
      categories: ["Air quality sensor", "Temperature sensor"],
      occurrenceIds: [30, 31],
      representativeId: 30,
    },
  ],
};
const model: LibraryModel = {
  id: modelId,
  name: "BS19.ifc",
  fingerprint: "fixture",
  source: "existing",
  size: 4096,
  modifiedAt: "2026-10-05T10:00:00Z",
  index,
};
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(models: LibraryModel[] = [model]) {
  const api: LibraryApi = {
    list: vi.fn().mockResolvedValue(models),
    saveIndex: vi.fn().mockResolvedValue(index),
    hide: vi.fn().mockResolvedValue(undefined),
    upload: vi.fn().mockResolvedValue(model),
  };
  const worker: LibraryWorker = {
    openModel: vi.fn().mockResolvedValue(index),
    readProperties: vi.fn().mockResolvedValue([
      {
        name: "Identity Data",
        source: "instance",
        values: [{ name: "Generic Hard Asset", value: "Temperature sensor" }],
      },
    ]),
    readGeometry: vi.fn().mockResolvedValue({ meshes: [] }),
    dispose: vi.fn(),
  };
  const dependencies = { api, createWorker: () => worker };
  return { api, worker, dependencies };
}
describe("catalog workspace", () => {
  it("opens a centered preview from the card arrow while ordinary clicks keep the side inspector", async () => {
    const { dependencies, worker } = setup();
    render(<App dependencies={dependencies} />);
    const card = await screen.findByRole("button", { name: "Inspect Sensor type" });
    fireEvent.click(card);
    await screen.findByText("Generic Hard Asset");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(card.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));

    const arrow = screen.getByRole("button", { name: "Open Sensor type in centered preview" });
    arrow.focus();
    fireEvent.click(arrow);
    const popup = await screen.findByRole("dialog", { name: "Asset preview" });
    await within(popup).findByText("Generic Hard Asset");
    expect(within(popup).getByText(/No preview geometry/)).toBeTruthy();
    expect(card.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: "Close inspector" })).toBeNull();
    expect(worker.readProperties).toHaveBeenCalledTimes(2);
    fireEvent.click(within(popup).getByRole("button", { name: "Close dialog" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(arrow);
    expect(card.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Sensor type in centered preview" }));
    const listPopup = await screen.findByRole("dialog", { name: "Asset preview" });
    await within(listPopup).findByText("Generic Hard Asset");
    fireEvent(listPopup, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("preserves an uploaded model and selection when the initial inventory arrives late", async () => {
    const { dependencies, api } = setup();
    const inventory = deferred<LibraryModel[]>();
    vi.mocked(api.list).mockReturnValueOnce(inventory.promise);
    const uploaded: LibraryModel = {
      ...model,
      id: '10000000-0000-4000-8000-000000000002',
      name: "uploaded.ifc",
      source: "upload",
    };
    vi.mocked(api.upload).mockResolvedValueOnce(uploaded);
    vi.mocked(api.list).mockResolvedValueOnce([model, uploaded]);
    render(<App dependencies={dependencies} />);
    await screen.findByText("Finding local IFC models…");
    fireEvent.click(screen.getByRole("button", { name: "Add model" }));
    fireEvent.change(screen.getByLabelText("IFC file"), {
      target: { files: [new File(["fixture"], "uploaded.ifc")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload model" }));
    await screen.findByRole("option", { name: "uploaded.ifc" });
    await act(async () => inventory.resolve([model]));
    expect(screen.getByRole('option', { name: 'BS19.ifc' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Source model' })).toHaveProperty('value', uploaded.id);
    expect(
      screen.getByRole("combobox", { name: "Source model" }).textContent,
    ).toContain("uploaded.ifc");
    expect(
      screen.getByRole("button", { name: /Inspect Sensor type/ }),
    ).toBeTruthy();
    expect(screen.queryByText("Your library has no models")).toBeNull();
    expect(screen.queryByText("Finding local IFC models…")).toBeNull();
  });
  it.each(['download', 'save'])('reloads a changed cached source after a %s conflict and inspects only current occurrences', async boundary => {
    const { dependencies, api, worker } = setup();
    const revised: CatalogIndex = { ...index, fingerprint: 'replacement', types: index.types.map(type => ({ ...type, name: 'Replacement pump type', representativeId: 130, occurrenceIds: [130, 131] })) };
    vi.mocked(api.list).mockResolvedValueOnce([model]).mockResolvedValueOnce([{ ...model, fingerprint: revised.fingerprint, index: null }]);
    if (boundary === 'download') vi.mocked(worker.openModel).mockRejectedValueOnce(new SourceRevisionError());
    else {
      vi.mocked(worker.openModel).mockResolvedValueOnce(index);
      vi.mocked(api.saveIndex).mockRejectedValueOnce(new SourceRevisionError());
    }
    vi.mocked(worker.openModel).mockResolvedValue(revised);
    render(<App dependencies={dependencies} />);
    fireEvent.click(await screen.findByRole('button', { name: /Inspect Sensor type/ }));
    await screen.findByText('Generic Hard Asset');
    expect(screen.getByRole('heading', { name: 'Replacement pump type' })).toBeTruthy();
    expect(worker.readProperties).toHaveBeenCalledWith({ modelId, elementId: 130 });
    expect(worker.readProperties).not.toHaveBeenCalledWith({ modelId, elementId: 30 });
    expect(worker.readGeometry).not.toHaveBeenCalledWith({ modelId, elementId: 31 });
    expect(screen.queryByText(/Saving failed/)).toBeNull();
    expect(worker.openModel).toHaveBeenLastCalledWith(expect.objectContaining({ model: expect.objectContaining({ fingerprint: 'replacement' }) }));
  });
  it('returns keyboard focus to the category toggle when its open sidebar closes', async () => {
    const { dependencies } = setup();
    render(<App dependencies={dependencies} />);
    const category = await screen.findByRole('button', { name: /^Temperature sensor, 1 type/ });
    const toggle = screen.getByRole('button', { name: 'Toggle collections and categories' });
    fireEvent.click(toggle);
    category.focus();
    fireEvent.click(category);
    expect(document.activeElement).toBe(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
  it('does not resurrect a hidden upload from a late post-upload inventory response', async () => {
    const { dependencies, api } = setup();
    const uploaded: LibraryModel = { ...model, id: '10000000-0000-4000-8000-000000000002', name: 'uploaded.ifc', source: 'upload' };
    const pending = deferred<LibraryModel[]>();
    vi.mocked(api.list).mockResolvedValueOnce([model]).mockReturnValueOnce(pending.promise);
    vi.mocked(api.upload).mockResolvedValueOnce(uploaded);
    const hook = renderHook(() => useLibrary(dependencies));
    await waitFor(() => expect(hook.result.current.model?.id).toBe(modelId));
    let upload: Promise<void> | undefined;
    await act(async () => { upload = hook.result.current.upload(new File(['fixture'], 'uploaded.ifc'), () => {}); });
    expect(hook.result.current.model?.id).toBe(uploaded.id);
    await act(async () => hook.result.current.hide());
    await act(async () => { pending.resolve([model, uploaded]); await upload; });
    expect(hook.result.current.models.map(item => item.id)).toEqual([modelId]);
    expect(hook.result.current.model?.id).toBe(modelId);
  });
  it('retains a completed upload catalog when its earlier inventory snapshot arrives', async () => {
    const { dependencies, api, worker } = setup();
    const id = '10000000-0000-4000-8000-000000000002';
    const uploaded: LibraryModel = { ...model, id, name: 'uploaded.ifc', source: 'upload', index: null };
    const catalog: CatalogIndex = { ...index, modelId: id, types: index.types.map(type => ({ ...type, modelId: id })) };
    const pending = deferred<LibraryModel[]>();
    vi.mocked(api.list).mockResolvedValueOnce([model]).mockReturnValueOnce(pending.promise);
    vi.mocked(api.upload).mockResolvedValueOnce(uploaded);
    vi.mocked(worker.openModel).mockResolvedValueOnce(catalog);
    const hook = renderHook(() => useLibrary(dependencies));
    await waitFor(() => expect(hook.result.current.model?.id).toBe(modelId));
    let upload: Promise<void> | undefined;
    await act(async () => { upload = hook.result.current.upload(new File(['fixture'], 'uploaded.ifc'), () => {}); });
    await waitFor(() => expect(hook.result.current.model?.index).toEqual(catalog));
    await act(async () => { pending.resolve([model, uploaded]); await upload; });
    expect(hook.result.current.model?.index).toEqual(catalog);
    expect(hook.result.current.models.map(item => item.id)).toEqual([modelId, id]);
  });
  it('ignores revision refresh metadata arriving after the selected source is hidden', async () => {
    const { dependencies, api, worker } = setup();
    const pending = deferred<LibraryModel[]>();
    vi.mocked(api.list).mockResolvedValueOnce([model]).mockReturnValueOnce(pending.promise);
    vi.mocked(worker.openModel).mockRejectedValueOnce(new SourceRevisionError());
    render(<App dependencies={dependencies} />);
    fireEvent.click(await screen.findByRole('button', { name: /Inspect Sensor type/ }));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Remove model' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove from library' }));
    await screen.findByText('Your library has no models');
    await act(async () => pending.resolve([{ ...model, fingerprint: 'replacement', index: null }]));
    expect(screen.queryByRole('option', { name: 'BS19.ifc' })).toBeNull();
    expect(worker.readProperties).not.toHaveBeenCalled();
    expect(worker.openModel).toHaveBeenCalledTimes(1);
  });
  it("reopens the source when inspection is retried after a worker failure", async () => {
    const { dependencies, worker } = setup();
    vi.mocked(worker.readProperties).mockRejectedValueOnce(
      new Error("Worker stopped"),
    );
    render(<App dependencies={dependencies} />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Inspect Sensor type/ }),
    );
    await screen.findByText("Worker stopped");
    fireEvent.click(screen.getByRole("button", { name: "Retry inspection" }));
    await screen.findByText("Generic Hard Asset");
    expect(worker.openModel).toHaveBeenCalledTimes(2);
  });
  it("filters supplied records, changes display, and reads selected properties", async () => {
    const { dependencies } = setup();
    render(<App dependencies={dependencies} />);
    await screen.findByRole("button", { name: /Inspect Sensor type/ });
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search asset types" }),
      { target: { value: "no match" } },
    );
    expect(screen.getByText("No matching asset types")).toBeTruthy();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search asset types" }),
      { target: { value: "Sensor" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    fireEvent.click(
      screen.getByRole("button", { name: /^Temperature sensor, 1 type/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Inspect Sensor type/ }),
    );
    await screen.findByText("Generic Hard Asset");
    expect(screen.getByText("Read-only properties")).toBeTruthy();
    expect(screen.getByText(/No preview geometry/)).toBeTruthy();
  });
  it("announces indexing failures and permits a retry", async () => {
    const { dependencies, worker } = setup([{ ...model, index: null }]);
    vi.mocked(worker.openModel).mockRejectedValueOnce(
      new Error("Invalid IFC data"),
    );
    render(<App dependencies={dependencies} />);
    await screen.findByText("Invalid IFC data");
    fireEvent.click(screen.getByRole("button", { name: "Retry processing" }));
    await screen.findByRole("button", { name: /Inspect Sensor type/ });
  });
  it("shows the empty library when no source files are available", async () => {
    const { dependencies } = setup([]);
    render(<App dependencies={dependencies} />);
    await screen.findByText("Your library has no models");
  });
  it("ignores late inspection results after closing the inspector", async () => {
    const { dependencies, worker } = setup();
    const pending = deferred<PropertyGroup[]>();
    vi.mocked(worker.readProperties).mockReturnValue(pending.promise);
    render(<App dependencies={dependencies} />);
    fireEvent.click(
      await screen.findByRole("button", { name: /Inspect Sensor type/ }),
    );
    await waitFor(() => expect(worker.readProperties).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Close inspector" }));
    await act(async () =>
      pending.resolve([
        { name: "Late property", source: "instance", values: [] },
      ]),
    );
    expect(screen.queryByText("Late property")).toBeNull();
  });
  it("cannot restore a removed model from a late indexing result", async () => {
    const { dependencies, worker, api } = setup([{ ...model, index: null }]);
    const pending = deferred<CatalogIndex>();
    vi.mocked(worker.openModel).mockReturnValue(pending.promise);
    render(<App dependencies={dependencies} />);
    await screen.findByText("Opening IFC source…");
    fireEvent.click(screen.getByRole("button", { name: "Remove model" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Remove from library" }),
    );
    await screen.findByText("Your library has no models");
    await act(async () => pending.resolve(index));
    expect(api.saveIndex).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: /Inspect Sensor type/ }),
    ).toBeNull();
  });
  it("permits processing retry after a failed removal cancels indexing", async () => {
    const { dependencies, worker, api } = setup([{ ...model, index: null }]);
    vi.mocked(worker.openModel).mockReturnValueOnce(new Promise(() => {}));
    vi.mocked(api.hide).mockRejectedValueOnce(
      new Error("Service disconnected"),
    );
    render(<App dependencies={dependencies} />);
    await screen.findByText("Opening IFC source…");
    fireEvent.click(screen.getByRole("button", { name: "Remove model" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Remove from library" }),
    );
    await screen.findByText("Service disconnected");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry processing" }));
    await screen.findByRole("button", { name: /Inspect Sensor type/ });
  });
});
