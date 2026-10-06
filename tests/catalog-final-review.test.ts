import { describe, expect, it } from "vitest";
import {
  applyLibraryCommand,
  emptyCatalogLibrary,
  duplicateCandidates,
  entryFieldSuggestions,
} from "../shared/catalog-rules.js";
import { entrySpecifications } from "../src/catalog/display.js";
import type {
  CatalogLibrary,
  LibraryCommand,
  LibrarySnapshot,
} from "../shared/catalog-library.js";

function snapshot(
  model = "a",
  values = [0.6, 0.6],
  key = "A/Width",
): LibrarySnapshot {
  return {
    modelId: model,
    fingerprint: "v1",
    sourceName: `${model}.ifc`,
    types: [
      {
        typeGlobalId: "type",
        name: "Cabinet",
        ifcClass: "IfcFurnitureType",
        categories: ["Cabinet"],
        occurrenceIds: [1, 2],
        fields: [
          {
            key,
            pset: model,
            name: "Width",
            measure: "IFCLENGTHMEASURE",
            unit: "m",
            values: values.map((value, i) => ({
              rawValue: String(value),
              normalized: { kind: "number", value, unit: "m" },
              occurrenceIds: [i + 1],
            })),
          },
        ],
      },
    ],
  };
}
function command(
  state: CatalogLibrary,
  input: Omit<Extract<LibraryCommand, { kind: "import" }>, "expectedRevision">,
): CatalogLibrary {
  return applyLibraryCommand(state, {
    ...input,
    expectedRevision: state.revision,
  });
}
function imported() {
  return command(emptyCatalogLibrary(), {
    kind: "import",
    snapshot: snapshot(),
  });
}
function first(state: CatalogLibrary) {
  const entry = state.entries[0];
  if (!entry) throw Error("fixture entry");
  return entry;
}
function mapWidth(state: CatalogLibrary) {
  const category = state.categories[0];
  if (!category) throw Error("fixture category");
  return applyLibraryCommand(state, {
    kind: "template",
    expectedRevision: state.revision,
    categoryId: category.id,
    mappings: [
      {
        key: "width",
        sourceKeys: ["A/Width", "B/OverallWidth"],
        label: "Width",
        dataKind: "number",
        canonicalUnit: "m",
        role: "variant",
      },
    ],
  });
}
describe("final review domain regressions", () => {
  it("freezes accepted published values through refresh and mapping removal", () => {
    let state = imported();
    const category = state.categories[0];
    if (!category) throw Error("fixture");
    state = applyLibraryCommand(state, {
      kind: "template",
      expectedRevision: state.revision,
      categoryId: category.id,
      mappings: [
        {
          key: "A/Width",
          label: "Width",
          dataKind: "number",
          canonicalUnit: "m",
          role: "variant",
        },
      ],
    });
    state = applyLibraryCommand(state, {
      kind: "approve",
      expectedRevision: state.revision,
      entryIds: [first(state).id],
    });
    const accepted = entrySpecifications(state, first(state));
    state = command(state, {
      kind: "import",
      snapshot: { ...snapshot("a", [0.9, 0.9]), fingerprint: "v2" },
    });
    expect(first(state).status).toBe("approved");
    expect(entrySpecifications(state, first(state))).toEqual(accepted);
    state = applyLibraryCommand(state, {
      kind: "template",
      expectedRevision: state.revision,
      categoryId: category.id,
      mappings: [],
    });
    expect(entrySpecifications(state, first(state))).toEqual(accepted);
  });
  it("compares canonical parameters across source names and splits by values, not exporters", () => {
    let state = mapWidth(imported());
    state = command(state, {
      kind: "import",
      snapshot: snapshot("b", [0.6, 0.6], "B/OverallWidth"),
    });
    expect(duplicateCandidates(state, first(state).id)[0]?.confidence).toBe(
      "specifications",
    );
    const other = state.entries[1];
    if (!other) throw Error("fixture");
    state = applyLibraryCommand(state, {
      kind: "merge",
      expectedRevision: state.revision,
      targetId: first(state).id,
      absorbedIds: [other.id],
    });
    expect(entryFieldSuggestions(state, first(state))).toMatchObject([
      { key: "width", status: "consistent" },
    ]);
    expect(() =>
      applyLibraryCommand(state, {
        kind: "split",
        expectedRevision: state.revision,
        entryId: first(state).id,
        variantFieldKeys: ["width"],
      }),
    ).toThrow("at least two");
  });
  it("shows conflicting overlapping mapped properties on the same occurrence", () => {
    const snap = snapshot();
    const type = snap.types[0];
    const field = type?.fields[0];
    if (!type || !field) throw Error("fixture");
    type.fields.push({
      ...field,
      key: "B/OverallWidth",
      values: [
        {
          rawValue: "0.9",
          normalized: { kind: "number", value: 0.9, unit: "m" },
          occurrenceIds: [1, 2],
        },
      ],
    });
    let state = command(emptyCatalogLibrary(), {
      kind: "import",
      snapshot: snap,
    });
    state = mapWidth(state);
    expect(entryFieldSuggestions(state, first(state))).toMatchObject([
      { key: "width", status: "conflicting" },
    ]);
    expect(() =>
      applyLibraryCommand(state, {
        kind: "split",
        expectedRevision: state.revision,
        entryId: first(state).id,
        variantFieldKeys: ["width"],
      }),
    ).toThrow(/conflict/i);
  });
  it("treats unnormalized dimensional text as missing duplicate evidence but retains ordinary text", () => {
    let state = emptyCatalogLibrary();
    for (const model of ["a", "b"]) {
      const snap = snapshot(model);
      for (const field of snap.types[0]?.fields ?? []) {
        field.unit = null;
        field.values = [
          {
            rawValue: "800",
            normalized: { kind: "text", value: "800", unit: null },
            occurrenceIds: [1, 2],
          },
        ];
      }
      state = command(state, { kind: "import", snapshot: snap });
    }
    expect(duplicateCandidates(state, first(state).id)[0]).toMatchObject({
      confidence: "name",
      missingEvidence: expect.arrayContaining(["A/Width"]),
    });
    const ordinary = structuredClone(state);
    for (const source of ordinary.sources)
      for (const field of source.observation.fields) field.measure = "IFCLABEL";
    expect(
      duplicateCandidates(ordinary, first(ordinary).id)[0]?.confidence,
    ).toBe("specifications");
  });
});

it("migrates legacy accepted values deterministically and never infers stale historical values", async () => {
  const { migrateCatalog } = await import("../shared/catalog-publication.js");
  let state = imported();
  const category = state.categories[0];
  if (!category) throw Error("category");
  state = applyLibraryCommand(state, {
    kind: "template",
    expectedRevision: state.revision,
    categoryId: category.id,
    mappings: [
      {
        key: "A/Width",
        label: "Accepted width",
        dataKind: "number",
        canonicalUnit: "m",
        role: "specification",
      },
    ],
  });
  first(state).status = "approved";
  delete first(state).publication;
  const migrated = migrateCatalog(structuredClone(state));
  expect(
    entrySpecifications(migrated, first(migrated))["A/Width"],
  ).toMatchObject({ value: 0.6 });
  expect(migrateCatalog(structuredClone(migrated))).toEqual(migrated);
  expect(migrated.revision).toBe(state.revision);
  const stale = structuredClone(state);
  const source = stale.sources[0];
  if (!source) throw Error("source");
  source.fingerprint = "v2";
  const retained = migrateCatalog(stale);
  expect(first(retained).status).toBe("approved");
  expect(entrySpecifications(retained, first(retained))).toEqual({});
  expect(first(retained).reviewFlags).toContain("source-changed");
});
it("keeps published values when category aliases absorb the original category", () => {
  let state = mapWidth(imported());
  state = applyLibraryCommand(state, {
    kind: "approve",
    expectedRevision: state.revision,
    entryIds: [first(state).id],
  });
  state = applyLibraryCommand(state, {
    kind: "category",
    expectedRevision: state.revision,
    id: "casework",
    name: "Casework",
    aliases: ["Cabinet"],
  });
  expect(first(state).definition.categoryId).toBe("casework");
  expect(entrySpecifications(state, first(state)).width).toMatchObject({
    value: 0.6,
  });
});
it("preserves copied unknown-measure evidence instead of upgrading it to comparable text", () => {
  let state = imported();
  state = command(state, { kind: "import", snapshot: snapshot("b") });
  for (const entry of [...state.entries])
    state = applyLibraryCommand(state, {
      kind: "edit",
      expectedRevision: state.revision,
      entryId: entry.id,
      definition: {
        ...entry.definition,
        specifications: {
          "A/Width": {
            kind: "text",
            value: "800",
            unit: null,
            unresolvedMeasure: true,
          },
        },
      },
    });
  expect(duplicateCandidates(state, first(state).id)[0]?.confidence).toBe(
    "name",
  );
});
it("shows bounded numeric precision without changing stored values", async () => {
  const { valueText } = await import("../src/catalog/display.js");
  const value = {
    kind: "number",
    value: 8.209124116586796,
    unit: "m²",
  } satisfies import("../shared/catalog-library.js").NormalizedValue;
  expect(valueText(value)).toBe("8.209124 m²");
  expect(value.value).toBe(8.209124116586796);
});

it("enriches legacy same-fingerprint analysis once, then remains idempotent", () => {
  let state = imported();
  const updated = snapshot();
  updated.analysisVersion = 2;
  for (const field of updated.types[0]?.fields ?? [])
    for (const value of field.values) {
      value.sourceUnit = field.unit;
      value.sourceMeasure = field.measure;
    }
  const oldRevision = state.revision;
  state = command(state, { kind: "import", snapshot: updated });
  expect(state.revision).toBe(oldRevision + 1);
  expect(state.sources[0]?.observation.fields[0]?.values[0]?.sourceUnit).toBe(
    "m",
  );
  expect(command(state, { kind: "import", snapshot: updated })).toBe(state);
});
