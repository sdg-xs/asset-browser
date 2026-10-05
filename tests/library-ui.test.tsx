// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
