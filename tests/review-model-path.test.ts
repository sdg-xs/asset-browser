import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { reviewModelPath } from "../scripts/review-model-path.mjs";

const roots = { sourceRoot: resolve("property-sources"), dataRoot: resolve("managed-data") };

it("resolves a persisted source model relative to the configured property folder", () => {
  expect(reviewModelPath({ path: "BS19/IFC/BS19.ifc", model: { source: "existing" } }, roots))
    .toBe(join(roots.sourceRoot, "BS19", "IFC", "BS19.ifc"));
});

it("resolves a persisted upload relative to the managed uploads folder", () => {
  expect(reviewModelPath({ path: "model.ifc", model: { source: "upload" } }, roots))
    .toBe(join(roots.dataRoot, "uploads", "model.ifc"));
});

it("keeps legacy absolute model paths for both model sources", () => {
  const path = resolve("legacy-device", "model.ifc");
  for (const source of ["existing", "upload"]) {
    expect(reviewModelPath({ path, model: { source } }, roots)).toBe(path);
  }
});
