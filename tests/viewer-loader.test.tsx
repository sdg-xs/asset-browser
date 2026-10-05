// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  AssetInspector,
  type ViewerLoader,
} from "../src/components/AssetInspector.js";
import type { Inspection } from "../src/library/useLibrary.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("keeps catalog and properties available after a viewer download fails, then retries the loader", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const loadViewer = vi
    .fn<ViewerLoader>()
    .mockRejectedValueOnce(
      new Error("Failed to fetch dynamically imported module"),
    )
    .mockResolvedValueOnce({ default: () => <div>Recovered 3D preview</div> });
  const inspection: Inspection = {
    kind: "ready",
    asset: {
      id: "sensor",
      modelId: "10000000-0000-4000-8000-000000000001",
      typeGlobalId: "sensor-global-id",
      name: "Sensor type",
      ifcClass: "IFCBUILDINGELEMENTPROXYTYPE",
      categories: ["Temperature sensor"],
      occurrenceIds: [30],
      representativeId: 30,
    },
    properties: [
      {
        name: "Identity Data",
        source: "instance",
        values: [{ name: "Generic Hard Asset", value: "Temperature sensor" }],
      },
    ],
    geometry: { meshes: [] },
    notice: "",
    elementId: 30,
  };
  render(
    <>
      <h1>Asset catalog</h1>
      <AssetInspector
        inspection={inspection}
        onClose={() => {}}
        onRetry={() => {}}
        loadViewer={loadViewer}
      />
    </>,
  );
  await screen.findByRole("button", { name: "Retry viewer download" });
  expect(screen.getByRole("heading", { name: "Asset catalog" })).toBeTruthy();
  expect(screen.getByText("Generic Hard Asset")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Retry viewer download" }),
  );
  await screen.findByText("Recovered 3D preview");
  expect(loadViewer).toHaveBeenCalledTimes(2);
  expect(screen.getByText("Generic Hard Asset")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Retry viewer download" }),
  ).toBeNull();
});
