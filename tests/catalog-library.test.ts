import { describe, expect, it } from "vitest";
import { normalizeObservation } from "../shared/catalog-normalization.js";
import {
  applyLibraryCommand,
  emptyCatalogLibrary,
  entryIssues,
  duplicateCandidates,
  entryFieldSuggestions,
} from "../shared/catalog-rules.js";
import type {
  CatalogLibrary,
  LibrarySnapshot,
  LibraryEntry,
  EditableDefinition,
} from "../shared/catalog-library.js";
const n = (value: string, unit = "mm") =>
  normalizeObservation({ value, unit, measure: "IfcLengthMeasure" });
const snapshot = (
  values = ["600", "600"],
  fingerprint = "one",
): LibrarySnapshot => ({
  modelId: "model",
  fingerprint,
  sourceName: "Cabinets.ifc",
  types: [
    {
      typeGlobalId: "type",
      name: "Cabinet",
      ifcClass: "IfcFurnitureType",
      categories: ["Cabinet"],
      occurrenceIds: [1, 2],
      fields: [
        {
          key: "Dimensions/Width",
          pset: "Dimensions",
          name: "Width",
          measure: "IfcLengthMeasure",
          unit: "mm",
          values: values.map((rawValue, i) => ({
            rawValue,
            normalized: n(rawValue),
            occurrenceIds: [i + 1],
          })),
        },
      ],
    },
  ],
});
const imported = (snap = snapshot()) =>
  applyLibraryCommand(emptyCatalogLibrary(), {
    kind: "import",
    expectedRevision: 0,
    snapshot: snap,
  });
const first = (state: CatalogLibrary): LibraryEntry => {
  const entry = state.entries[0];
  if (!entry) throw Error("No entry");
  return entry;
};
const definition = (entry: LibraryEntry): EditableDefinition => ({
  ...entry.definition,
  specifications: { "Dimensions/Width": n("600") },
});
const edit = (state: CatalogLibrary, def = definition(first(state))) =>
  applyLibraryCommand(state, {
    kind: "edit",
    expectedRevision: state.revision,
    entryId: first(state).id,
    definition: def,
  });
describe("catalog domain", () => {
  it("retains product codes as source evidence without suggesting identity as specifications", () => {
    const snap = snapshot();
    const type = snap.types[0];
    if (!type) throw Error("Missing type");
    const names = [
      "Product code",
      "SKU",
      "Manufacturer Art. No.",
      "Code compliance rating",
    ];
    type.fields.push(
      ...names.map((name) => ({
        key: `Product/${name}`,
        pset: "Product",
        name,
        measure: "IFCLABEL",
        unit: null,
        values: [
          {
            rawValue: "Known",
            normalized: {
              kind: "text",
              value: "Known",
              unit: null,
            } satisfies ReturnType<typeof normalizeObservation>,
            occurrenceIds: [1, 2],
          },
        ],
      })),
    );
    const state = imported(snap);
    expect(
      state.sources[0]?.observation.fields.map((field) => field.name),
    ).toEqual(["Width", ...names]);
    const suggestions = state.templates.flatMap((template) =>
      template.suggestions.map((field) => field.label),
    );
    expect(suggestions).toContain("Code compliance rating");
    for (const name of names.slice(0, 3))
      expect(suggestions).not.toContain(name);
    expect(
      entryFieldSuggestions(state, first(state)).map((field) => field.key),
    ).not.toContain("Product/Product code");
  });
  it("normalizes equivalent units, blank versus zero and unsupported units", () => {
    expect(n("1000")).toEqual(n("1", "m"));
    expect(n("")).toEqual({ kind: "missing" });
    expect(n("0")).toMatchObject({ kind: "number", value: 0 });
    expect(n("12", "furlong")).toEqual({
      kind: "text",
      value: "12",
      unit: "furlong",
    });
  });
  it("ignores missing markers and Revit product identity", () => {
    let state = imported();
    const def = {
      ...definition(first(state)),
      kind: "product",
      manufacturer: { value: "Revit", confirmed: true },
      model: { value: "n/a", confirmed: true },
    } satisfies EditableDefinition;
    state = edit(state, def);
    expect(entryIssues(state, first(state))).toContain(
      "Product requires confirmed manufacturer and model.",
    );
  });
  it("retains conflicts and allows explicit staff resolution", () => {
    let state = imported(snapshot(["600", "800"]));
    expect(entryFieldSuggestions(state, first(state))[0]?.status).toBe(
      "conflicting",
    );
    expect(entryIssues(state, first(state))).toContain(
      "Unresolved source conflict: Dimensions/Width",
    );
    state = edit(state);
    expect(entryIssues(state, first(state))).toEqual([]);
    expect(entryFieldSuggestions(state, first(state))[0]?.status).toBe(
      "conflicting",
    );
  });
  it("requires reusable generic specifications or confirmed product identity for publication", () => {
    let state = imported();
    expect(entryIssues(state, first(state))).toContain(
      "Generic entry requires a known reusable specification.",
    );
    state = edit(state);
    state = applyLibraryCommand(state, {
      kind: "approve",
      expectedRevision: state.revision,
      entryIds: [first(state).id],
    });
    expect(first(state).status).toBe("approved");
  });
  it("does not merge unequal cabinets on name", () => {
    let state = imported();
    const second = snapshot(["800", "800"]);
    const secondType = second.types[0];
    if (!secondType) throw Error("Missing type");
    secondType.typeGlobalId = "other";
    state = applyLibraryCommand(state, {
      kind: "import",
      expectedRevision: state.revision,
      snapshot: second,
    });
    expect(state.entries).toHaveLength(2);
    const candidates = duplicateCandidates(state, first(state).id);
    expect(candidates[0]?.confidence).toBe("name");
    expect(candidates[0]?.differences).toContain("Dimensions/Width");
  });
  it("imports idempotently and preserves approved overrides and old geometry bindings on refresh", () => {
    let state = edit(imported());
    state = applyLibraryCommand(state, {
      kind: "approve",
      expectedRevision: state.revision,
      entryIds: [first(state).id],
    });
    const repeated = applyLibraryCommand(state, {
      kind: "import",
      expectedRevision: state.revision,
      snapshot: snapshot(),
    });
    expect(repeated).toEqual(state);
    const updated = applyLibraryCommand(state, {
      kind: "import",
      expectedRevision: state.revision,
      snapshot: snapshot(["900", "900"], "two"),
    });
    expect(first(updated).definition).toEqual(first(state).definition);
    expect(first(updated).status).toBe("approved");
    expect(first(updated).sourceReferences[0]?.fingerprint).toBe("one");
    expect(first(updated).reviewFlags).toContain("source-changed");
  });
  it("merges retain target definitions, combine references, archive absorbed entries and return draft", () => {
    let state = edit(imported());
    const other = snapshot();
    const otherType = other.types[0];
    if (!otherType) throw Error("Missing type");
    otherType.typeGlobalId = "other";
    state = applyLibraryCommand(state, {
      kind: "import",
      expectedRevision: state.revision,
      snapshot: other,
    });
    const target = first(state);
    const absorbed = state.entries[1];
    if (!absorbed) throw Error("Missing second");
    state = applyLibraryCommand(state, {
      kind: "merge",
      expectedRevision: state.revision,
      targetId: target.id,
      absorbedIds: [absorbed.id],
    });
    expect(first(state).definition).toEqual(target.definition);
    expect(first(state).sourceReferences).toHaveLength(2);
    expect(first(state).status).toBe("draft");
    expect(state.entries[1]?.status).toBe("archived");
  });
  it("splits only confirmed variant mappings into exact occurrence partitions and drafts", () => {
    let state = imported(snapshot(["600", "800"]));
    const category = state.categories[0];
    if (!category) throw Error("Missing category");
    state = applyLibraryCommand(state, {
      kind: "template",
      expectedRevision: state.revision,
      categoryId: category.id,
      mappings: [
        {
          key: "Dimensions/Width",
          label: "Width",
          dataKind: "number",
          canonicalUnit: "m",
          role: "variant",
        },
      ],
    });
    state = applyLibraryCommand(state, {
      kind: "split",
      expectedRevision: state.revision,
      entryId: first(state).id,
      variantFieldKeys: ["Dimensions/Width"],
    });
    const active = state.entries.filter((e) => e.status !== "archived");
    expect(active).toHaveLength(2);
    expect(
      active.map((e) => e.sourceReferences.flatMap((r) => r.occurrenceIds)),
    ).toEqual([[1], [2]]);
    expect(active.every((e) => e.status === "draft")).toBe(true);
  });
  it("rejects complete batch when one entry is incomplete, and rejects stale revisions", () => {
    let state = edit(imported());
    const other = snapshot();
    const otherType = other.types[0];
    if (!otherType) throw Error("Missing type");
    otherType.typeGlobalId = "other";
    state = applyLibraryCommand(state, {
      kind: "import",
      expectedRevision: state.revision,
      snapshot: other,
    });
    expect(() =>
      applyLibraryCommand(state, {
        kind: "approve",
        expectedRevision: state.revision,
        entryIds: state.entries.map((e) => e.id),
      }),
    ).toThrow("Publication");
    expect(state.entries.every((e) => e.status === "draft")).toBe(true);
    expect(() =>
      applyLibraryCommand(state, {
        kind: "archive",
        expectedRevision: 0,
        entryIds: [first(state).id],
      }),
    ).toThrow("revision");
  });
});

describe("catalog boundary and review invariants", () => {
  it.each([
    ["IfcAreaMeasure", "1000000", "mm²", "1", "m²"],
    ["IfcVolumeMeasure", "1000", "l", "1", "m³"],
    ["IfcPowerMeasure", "1", "kW", "1000", "W"],
    ["IfcVolumetricFlowRateMeasure", "60", "l/min", "0.001", "m³/s"],
    ["IfcElectricVoltageMeasure", "1", "kV", "1000", "V"],
  ])("normalizes %s with units", (measure, raw, unit, expected, canonical) => {
    expect(normalizeObservation({ value: raw, measure, unit })).toEqual(
      normalizeObservation({ value: expected, measure, unit: canonical }),
    );
  });
  it("keeps partial missing values detectable without selecting a false consistent suggestion", () => {
    const state = imported(snapshot(["600", ""]));
    expect(entryFieldSuggestions(state, first(state))[0]).toMatchObject({
      status: "missing",
      missingOccurrences: [2],
      values: [n("600")],
    });
    expect(first(state).definition.specifications).toEqual({});
  });
  it("retains exact categories and requires confirmation for template suggestions", () => {
    const snap = snapshot();
    const type = snap.types[0];
    if (!type) throw Error("Missing type");
    type.categories = ["Cabinet", "Cabinets"];
    const state = imported(snap);
    expect(state.categories.map((category) => category.name)).toEqual([
      "Cabinet",
      "Cabinets",
    ]);
    expect(first(state).definition.categoryId).toBeNull();
    expect(state.templates[0]?.mappings).toEqual([]);
    expect(
      state.templates[0]?.suggestions.map((mapping) => mapping.key),
    ).toEqual(["Dimensions/Width"]);
  });
  it("publishes a complete staff-confirmed product without generic specifications", () => {
    let state = imported();
    state = edit(state, {
      ...first(state).definition,
      kind: "product",
      manufacturer: { value: "Acme", confirmed: true },
      model: { value: "C600", confirmed: true },
    });
    expect(entryIssues(state, first(state))).toEqual([]);
    state = applyLibraryCommand(state, {
      kind: "approve",
      expectedRevision: state.revision,
      entryIds: [first(state).id],
    });
    expect(first(state).status).toBe("approved");
  });
  it("keeps approved definitions when a type disappears from the next snapshot", () => {
    let state = edit(imported());
    state = applyLibraryCommand(state, {
      kind: "approve",
      expectedRevision: state.revision,
      entryIds: [first(state).id],
    });
    const updated = applyLibraryCommand(state, {
      kind: "import",
      expectedRevision: state.revision,
      snapshot: { ...snapshot([], "removed"), types: [] },
    });
    expect(first(updated).status).toBe("approved");
    expect(first(updated).definition).toEqual(first(state).definition);
    expect(updated.sources[0]?.current).toBe(false);
    expect(first(updated).reviewFlags).toEqual(["source-changed"]);
  });
  it("rejects stale geometry rebinding and accepts explicitly reviewed current memberships", () => {
    let state = imported();
    state = applyLibraryCommand(state, {
      kind: "import",
      expectedRevision: state.revision,
      snapshot: snapshot(["800", "800"], "two"),
    });
    const entry = first(state);
    expect(() =>
      applyLibraryCommand(state, {
        kind: "edit",
        expectedRevision: state.revision,
        entryId: entry.id,
        definition: entry.definition,
        confirmedSourceReferences: entry.sourceReferences,
      }),
    ).toThrow("current source fingerprint");
    const updated = applyLibraryCommand(state, {
      kind: "edit",
      expectedRevision: state.revision,
      entryId: entry.id,
      definition: entry.definition,
      confirmedSourceReferences: entry.sourceReferences.map((reference) => ({
        ...reference,
        fingerprint: "two",
      })),
    });
    expect(first(updated).reviewFlags).toEqual([]);
    expect(first(updated).sourceReferences[0]?.fingerprint).toBe("two");
  });
  it("rejects invalid imported memberships atomically and does not mutate input", () => {
    const state = imported();
    const before = structuredClone(state);
    const invalid = snapshot();
    const type = invalid.types[0];
    const field = type?.fields[0];
    const value = field?.values[0];
    if (!value) throw Error("Missing fixture value");
    value.occurrenceIds = [999];
    expect(() =>
      applyLibraryCommand(state, {
        kind: "import",
        expectedRevision: state.revision,
        snapshot: invalid,
      }),
    ).toThrow("membership");
    expect(state).toEqual(before);
    const archived = applyLibraryCommand(state, {
      kind: "archive",
      expectedRevision: state.revision,
      entryIds: [first(state).id],
    });
    expect(state).toEqual(before);
    const restored = applyLibraryCommand(archived, {
      kind: "restore",
      expectedRevision: archived.revision,
      entryIds: [first(state).id],
    });
    expect(first(restored).status).toBe("draft");
  });
  it("requires confirmation before splitting variant suggestions", () => {
    const state = imported(snapshot(["600", "800"]));
    expect(() =>
      applyLibraryCommand(state, {
        kind: "split",
        expectedRevision: state.revision,
        entryId: first(state).id,
        variantFieldKeys: ["Dimensions/Width"],
      }),
    ).toThrow("confirmed variant");
  });
});
describe("SI prefix precision", () => {
  it("distinguishes milli and mega prefixes", () => {
    expect(
      normalizeObservation({
        value: "1",
        measure: "IfcPowerMeasure",
        unit: "mW",
      }),
    ).toEqual({ kind: "number", value: 0.001, unit: "W" });
    expect(
      normalizeObservation({
        value: "1",
        measure: "IfcPowerMeasure",
        unit: "MW",
      }),
    ).toEqual({ kind: "number", value: 1000000, unit: "W" });
    expect(
      normalizeObservation({
        value: "1",
        measure: "IfcElectricVoltageMeasure",
        unit: "MV",
      }),
    ).toEqual({ kind: "number", value: 1000000, unit: "V" });
  });
});
describe("category aliases and comparison evidence", () => {
  it("maps an explicitly chosen existing category label to one canonical category", () => {
    let state = imported();
    const other = snapshot();
    const type = other.types[0];
    if (!type) throw Error("Missing type");
    type.typeGlobalId = "plural";
    type.categories = ["Cabinets"];
    state = applyLibraryCommand(state, {
      kind: "import",
      expectedRevision: state.revision,
      snapshot: other,
    });
    const category = state.categories[0];
    if (!category) throw Error("Missing category");
    state = applyLibraryCommand(state, {
      kind: "category",
      expectedRevision: state.revision,
      id: category.id,
      name: "Cabinet",
      aliases: ["Cabinets"],
    });
    expect(state.categories).toEqual([
      { id: category.id, name: "Cabinet", aliases: ["Cabinets"] },
    ]);
    expect(
      state.entries.every(
        (entry) => entry.definition.categoryId === category.id,
      ),
    ).toBe(true);
    expect(state.sources[1]?.observation.categories).toEqual(["Cabinets"]);
  });
  it("does not treat unsupported numeric units as strong duplicate comparison evidence", () => {
    let state = imported();
    const other = snapshot();
    const type = other.types[0];
    if (!type) throw Error("Missing type");
    type.typeGlobalId = "other";
    for (const field of type.fields)
      for (const value of field.values)
        value.normalized = n("12", "unsupported");
    const original = snapshot();
    const originalType = original.types[0];
    if (!originalType) throw Error("Missing type");
    for (const field of originalType.fields)
      for (const value of field.values)
        value.normalized = n("12", "unsupported");
    state = imported(original);
    state = applyLibraryCommand(state, {
      kind: "import",
      expectedRevision: state.revision,
      snapshot: other,
    });
    expect(duplicateCandidates(state, first(state).id)[0]).toMatchObject({
      confidence: "name",
      missingEvidence: expect.arrayContaining(["Dimensions/Width"]),
    });
  });
});
describe("canonical category membership", () => {
  it("treats multiple labels mapped to the same canonical category as one category", () => {
    let state = imported();
    const category = state.categories[0];
    if (!category) throw Error("Missing category");
    state = applyLibraryCommand(state, {
      kind: "category",
      expectedRevision: state.revision,
      id: category.id,
      name: "Cabinet",
      aliases: ["Cabinets"],
    });
    const snap = snapshot();
    const type = snap.types[0];
    if (!type) throw Error("Missing type");
    type.typeGlobalId = "both";
    type.categories = ["Cabinet", "Cabinets"];
    state = applyLibraryCommand(state, {
      kind: "import",
      expectedRevision: state.revision,
      snapshot: snap,
    });
    expect(state.entries[1]?.definition.categoryId).toBe(category.id);
  });
});
describe("confirmed duplicate identity evidence", () => {
  it("shows unequal confirmed identity as differences rather than missing evidence", () => {
    let state = imported();
    const other = snapshot();
    const type = other.types[0];
    if (!type) throw Error("Missing type");
    type.typeGlobalId = "other";
    state = applyLibraryCommand(state, {
      kind: "import",
      expectedRevision: state.revision,
      snapshot: other,
    });
    state.entries.forEach((entry, index) => {
      entry.definition = {
        ...entry.definition,
        kind: "product",
        manufacturer: {
          value: index === 0 ? "Acme" : "Other",
          confirmed: true,
        },
        model: { value: index === 0 ? "C600" : "X600", confirmed: true },
      };
    });
    const candidate = duplicateCandidates(state, first(state).id)[0];
    expect(candidate?.differences).toEqual(
      expect.arrayContaining(["manufacturer", "model"]),
    );
    expect(candidate?.missingEvidence).not.toContain(
      "confirmed product identity",
    );
  });
});

describe("review round 1 regressions", () => {
  it("does not publish a source specification explicitly overridden as missing", () => {
    let state = imported();
    const category = state.categories[0];
    if (!category) throw Error("Missing category");
    state = applyLibraryCommand(state, {
      kind: "template",
      expectedRevision: state.revision,
      categoryId: category.id,
      mappings: [
        {
          key: "Dimensions/Width",
          label: "Width",
          dataKind: "number",
          canonicalUnit: "m",
          role: "specification",
        },
      ],
    });
    expect(entryIssues(state, first(state))).toEqual([]);
    state = edit(state, {
      ...first(state).definition,
      specifications: { "Dimensions/Width": { kind: "missing" } },
    });
    expect(entryIssues(state, first(state))).toContain(
      "Generic entry requires a known reusable specification.",
    );
    expect(() =>
      applyLibraryCommand(state, {
        kind: "approve",
        expectedRevision: state.revision,
        entryIds: [first(state).id],
      }),
    ).toThrow("Publication");
    expect(first(state).status).toBe("draft");
  });

  it("treats n-a as absent product identity and missing observed value", () => {
    expect(n(" n-a ")).toEqual({ kind: "missing" });
    let state = imported();
    const other = snapshot();
    const type = other.types[0];
    if (!type) throw Error("Missing type");
    type.typeGlobalId = "other";
    state = applyLibraryCommand(state, {
      kind: "import",
      expectedRevision: state.revision,
      snapshot: other,
    });
    for (const entry of state.entries) {
      state = applyLibraryCommand(state, {
        kind: "edit",
        expectedRevision: state.revision,
        entryId: entry.id,
        definition: {
          ...entry.definition,
          kind: "product",
          manufacturer: { value: "n-a", confirmed: true },
          model: { value: "N-A", confirmed: true },
        },
      });
    }
    expect(entryIssues(state, first(state))).toContain(
      "Product requires confirmed manufacturer and model.",
    );
    expect(() =>
      applyLibraryCommand(state, {
        kind: "approve",
        expectedRevision: state.revision,
        entryIds: [first(state).id],
      }),
    ).toThrow("Publication");
    expect(duplicateCandidates(state, first(state).id)[0]?.confidence).not.toBe(
      "identity",
    );
  });

  it("preserves absorbed split partitions through merge and restore", () => {
    let state = imported();
    const targetId = first(state).id;
    const other = snapshot(["600", "800"]);
    const type = other.types[0];
    if (!type) throw Error("Missing type");
    type.typeGlobalId = "other";
    state = applyLibraryCommand(state, {
      kind: "import",
      expectedRevision: state.revision,
      snapshot: other,
    });
    const category = state.categories[0];
    const toSplit = state.entries[1];
    if (!category || !toSplit) throw Error("Missing split fixture");
    state = applyLibraryCommand(state, {
      kind: "template",
      expectedRevision: state.revision,
      categoryId: category.id,
      mappings: [
        {
          key: "Dimensions/Width",
          label: "Width",
          dataKind: "number",
          canonicalUnit: "m",
          role: "variant",
        },
      ],
    });
    state = applyLibraryCommand(state, {
      kind: "split",
      expectedRevision: state.revision,
      entryId: toSplit.id,
      variantFieldKeys: ["Dimensions/Width"],
    });
    const variants = state.entries.filter(
      (entry) => entry.id !== targetId && entry.status === "draft",
    );
    expect(
      variants.map((entry) =>
        entry.sourceReferences.flatMap((reference) => reference.occurrenceIds),
      ),
    ).toEqual([[1], [2]]);
    const originalReferences = variants.map((entry) =>
      structuredClone(entry.sourceReferences),
    );
    state = applyLibraryCommand(state, {
      kind: "merge",
      expectedRevision: state.revision,
      targetId,
      absorbedIds: variants.map((entry) => entry.id),
    });
    expect(
      variants.map(
        (entry) =>
          state.entries.find((candidate) => candidate.id === entry.id)
            ?.sourceReferences,
      ),
    ).toEqual(originalReferences);
    state = applyLibraryCommand(state, {
      kind: "restore",
      expectedRevision: state.revision,
      entryIds: variants.map((entry) => entry.id),
    });
    expect(
      variants.map(
        (entry) =>
          state.entries.find((candidate) => candidate.id === entry.id)
            ?.sourceReferences,
      ),
    ).toEqual(originalReferences);
    expect(first(state).sourceReferences[1]?.occurrenceIds).toEqual([1, 2]);
  });

  it("suggests Sound Pressure Level while excluding spatial level metadata", () => {
    const snap = snapshot();
    const type = snap.types[0];
    if (!type) throw Error("Missing type");
    const field = type.fields[0];
    if (!field) throw Error("Missing field");
    type.fields = [
      {
        ...field,
        key: "Acoustic/Sound Pressure Level",
        pset: "Acoustic",
        name: "Sound Pressure Level",
      },
      {
        ...field,
        key: "Placement/Building Level",
        pset: "Placement",
        name: "Building Level",
      },
      { ...field, key: "Placement/Level", pset: "Placement", name: "Level" },
    ];
    const state = imported(snap);
    expect(
      state.templates[0]?.suggestions.map((mapping) => mapping.key),
    ).toEqual(["Acoustic/Sound Pressure Level"]);
    expect(
      entryFieldSuggestions(state, first(state)).map(
        (suggestion) => suggestion.key,
      ),
    ).toEqual(["Acoustic/Sound Pressure Level"]);
  });
});
