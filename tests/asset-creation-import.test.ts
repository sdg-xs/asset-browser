import request from "supertest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app.js";
import { LibraryModelsSchema } from "../shared/contracts.js";
import { catalogLibrarySchema, type LibrarySnapshot } from "../shared/catalog-library.js";
import { CreationIndexSchema } from "../shared/asset-creation.js";
import { applyLibraryCommand, emptyCatalogLibrary, entryIssues } from "../shared/catalog-rules.js";
import { sourceObservationKey } from "../shared/catalog-source-identity.js";
import { libraryFixture } from "./library-fixtures.js";
import { IfcReader } from "../src/ifc/reader.js";

const snapshot: LibrarySnapshot = { analysisVersion: 3, modelId: "model", fingerprint: "revision", sourceName: "Fixture.ifc", types: [
  { typeGlobalId: "typed", name: "Typed", ifcClass: "IFCFURNITURETYPE", categories: ["Furniture"], occurrenceIds: [1, 2], fields: [] },
  { typeGlobalId: null, elementGlobalId: "element-a", name: "Element", ifcClass: "IFCFURNITURE", categories: [], occurrenceIds: [3], fields: [] },
  { typeGlobalId: null, elementGlobalId: "element-b", name: "Element", ifcClass: "IFCFURNITURE", categories: [], occurrenceIds: [4], fields: [] },
] };
function select(state = emptyCatalogLibrary(), keys = ["type:typed"], analysis = snapshot) {
  return applyLibraryCommand(state, { kind: "import-selected", expectedRevision: state.revision, snapshot: analysis, candidateKeys: keys });
}
describe("selective creation import", () => {
  it("creates one draft for identical identified types and retains every source reference", () => {
    const first = snapshot.types[0];
    if (!first) throw Error("Missing typed observation");
    const analysis: LibrarySnapshot = { ...snapshot, types: [first, { ...first, typeGlobalId: "duplicate", occurrenceIds: [3] }] };
    const state = select(emptyCatalogLibrary(), ["type:typed", "type:duplicate"], analysis);
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]?.sourceReferences.map(reference => reference.occurrenceIds)).toEqual([[1, 2], [3]]);
    expect(state.sources).toHaveLength(2);
    expect(select(state, ["type:typed", "type:duplicate"], analysis)).toBe(state);
  });
  it("groups by type name and retains different technical values in source evidence", () => {
    const first = snapshot.types[0];
    if (!first) throw Error("Missing typed observation");
    const field = { key: "width", name: "Width", pset: "Dimensions", measure: "IFCLENGTHMEASURE", unit: "m" };
    const analysis: LibrarySnapshot = { ...snapshot, types: [
      { ...first, fields: [{ ...field, values: [{ rawValue: "1", normalized: { kind: "number", value: 1, unit: "m" }, occurrenceIds: [1, 2] }] }] },
      { ...first, typeGlobalId: "wide", occurrenceIds: [3], fields: [{ ...field, values: [{ rawValue: "2", normalized: { kind: "number", value: 2, unit: "m" }, occurrenceIds: [3] }] }] },
    ] };
    const state = select(emptyCatalogLibrary(), ["type:typed", "type:wide"], analysis);
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]?.sourceReferences).toHaveLength(2);
    expect(state.sources.map(source => source.observation.fields[0]?.values[0]?.normalized)).toEqual([
      { kind: "number", value: 1, unit: "m" }, { kind: "number", value: 2, unit: "m" },
    ]);
  });
  it("ignores symbol placement and installation addresses, and allows matching blank properties", () => {
    const first = snapshot.types[0];
    if (!first) throw Error("Missing typed observation");
    const fields = (ids: number[], address: string, elevation: number) => [
      { key: "fire-address", name: "Fire Address", pset: "Identity Data", measure: "IFCLABEL", unit: null,
        values: [{ rawValue: address, normalized: { kind: "text" as const, value: address, unit: null }, occurrenceIds: ids }] },
      { key: "symbol-elevation", name: "Symbol Drop Elevation", pset: "Dimensions", measure: "IFCLENGTHMEASURE", unit: "m",
        values: [{ rawValue: String(elevation), normalized: { kind: "number" as const, value: elevation, unit: "m" }, occurrenceIds: ids }] },
      { key: "description", name: "Description", pset: "Identity Data", measure: "IFCLABEL", unit: null,
        values: [{ rawValue: "", normalized: { kind: "missing" as const }, occurrenceIds: ids }] },
    ];
    const analysis: LibrarySnapshot = { ...snapshot, types: [
      { ...first, fields: fields([1, 2], "A", 1) },
      { ...first, typeGlobalId: "duplicate", occurrenceIds: [3], fields: fields([3], "B", 2) },
    ] };
    expect(select(emptyCatalogLibrary(), ["type:typed", "type:duplicate"], analysis).entries).toHaveLength(1);
  });
  it("combines exporter rounding differences without changing recorded values", () => {
    const first = snapshot.types[0];
    if (!first) throw Error("Missing typed observation");
    const observed = (ids: number[], value: number) => [{
      key: "volume", name: "Volume", pset: "Dimensions", measure: "IFCVOLUMEMEASURE", unit: "m³",
      values: [{ rawValue: String(value), normalized: { kind: "number" as const, value, unit: "m³" }, occurrenceIds: ids }],
    }];
    const analysis: LibrarySnapshot = { ...snapshot, types: [
      { ...first, fields: observed([1, 2], 0.0007192365988812223) },
      { ...first, typeGlobalId: "duplicate", occurrenceIds: [3], fields: observed([3], 0.0007192365988812221) },
    ] };
    const state = select(emptyCatalogLibrary(), ["type:typed", "type:duplicate"], analysis);
    expect(state.entries).toHaveLength(1);
    expect(state.sources.map(source => source.observation.fields[0]?.values[0]?.normalized)).toEqual([
      { kind: "number", value: 0.0007192365988812223, unit: "m³" },
      { kind: "number", value: 0.0007192365988812221, unit: "m³" },
    ]);
  });
  it("requires explicit selection for complete discovery and flags changed same-revision observations", () => {
    expect(() => applyLibraryCommand(emptyCatalogLibrary(), { kind: "import", expectedRevision: 0, snapshot })).toThrow();
    const first = select();
    const changed = structuredClone(snapshot);
    const observation = changed.types[0];
    if (!observation) throw Error("Missing observation");
    observation.fields.push({ key: "comments", pset: "Identity Data", name: "Comments", measure: "IFCLABEL", unit: null, values: [{ rawValue: "Changed", normalized: { kind: "text", value: "Changed", unit: null }, occurrenceIds: [1, 2] }] });
    const refreshed = select(first, ["type:typed"], changed);
    expect(refreshed.sources[0]?.observation).toEqual(observation);
    expect(refreshed.sources[0]?.id).toBe(first.sources[0]?.id);
    expect(refreshed.entries[0]?.reviewFlags).toContain("source-changed");
  });
  it("persists complete observations, creates only selected drafts and imports an observed candidate later", () => {
    const first = select();
    expect(first.sources).toHaveLength(3);
    expect(first.entries).toHaveLength(1);
    expect(first.entries[0]?.status).toBe("draft");
    const second = select(first, ["element:element-a"]);
    expect(second.entries).toHaveLength(2);
    expect(second.sources.map(source => source.id)).toEqual(first.sources.map(source => source.id));
    expect(select(second, ["element:element-a"])).toBe(second);
    const element = second.entries[1];
    if (!element) throw Error("Missing draft");
    expect(entryIssues(second, element)).toContain("Canonical category is required.");
    const archived = applyLibraryCommand(second, { kind: "archive", expectedRevision: second.revision, entryIds: [element.id] });
    expect(select(archived, ["element:element-a"])).toBe(archived);
    expect(archived.entries).toHaveLength(2);
    expect(new Set(first.sources.map(source => sourceObservationKey(source.observation))).size).toBe(3);
  });
  it.each([{ keys: [] }, { keys: ["missing"] }, { keys: ["type:typed", "type:typed"] }])("rejects invalid selection $keys atomically", ({ keys }) => {
    const state = emptyCatalogLibrary();
    expect(() => select(state, keys)).toThrow();
    expect(state).toEqual(emptyCatalogLibrary());
  });
  it("preserves legacy UUIDs, approved publications and exclusions during same-fingerprint complete analysis", () => {
    const typed = snapshot.types[0];
    if (!typed) throw Error("Missing typed observation");
    let legacy = applyLibraryCommand(emptyCatalogLibrary(), { kind: "import", expectedRevision: 0, snapshot: { ...snapshot, analysisVersion: 2, types: [typed] } });
    const entry = legacy.entries[0];
    if (!entry) throw Error("Missing legacy entry");
    legacy = applyLibraryCommand(legacy, { kind: "edit", expectedRevision: legacy.revision, entryId: entry.id, definition: { ...entry.definition, name: "Curated name", specifications: { width: { kind: "number", value: 0.8, unit: "m" } } } });
    legacy = applyLibraryCommand(legacy, { kind: "approve", expectedRevision: legacy.revision, entryIds: [entry.id] });
    legacy.excludedSourceParameterNames = ["location line"];
    const complete = select(legacy);
    expect(complete.sources[0]?.id).toBe(legacy.sources[0]?.id);
    expect(complete.entries[0]?.publication).toEqual(legacy.entries[0]?.publication);
    expect(complete.entries[0]?.status).toBe("approved");
    expect(complete.entries[0]?.definition).toEqual(legacy.entries[0]?.definition);
    expect(complete.entries[0]?.reviewFlags).toContain("source-changed");
    expect(complete.excludedSourceParameterNames).toEqual(["location line"]);
    const typedOnly = applyLibraryCommand(complete, { kind: "import", expectedRevision: complete.revision, snapshot: { ...snapshot, analysisVersion: 2, types: [typed] } });
    expect(typedOnly.sources.filter(source => source.observation.typeGlobalId === null).every(source => source.current)).toBe(true);
  });
});

describe("creation import source boundary", () => {
  let fixture: Awaited<ReturnType<typeof libraryFixture>> | undefined;
  afterEach(async () => fixture?.cleanup());
  it("reads an old schema-1 catalog without changing legacy UUIDs, approval, exclusions or frozen values", async () => {
    fixture = await libraryFixture();
    let app = await createApp(fixture);
    const observation = snapshot.types[0];
    if (!observation) throw Error("Missing typed observation");
    let legacy = applyLibraryCommand(emptyCatalogLibrary(), { kind: "import", expectedRevision: 0, snapshot: { ...snapshot, analysisVersion: undefined, types: [observation] } });
    const entry = legacy.entries[0];
    if (!entry) throw Error("Missing legacy entry");
    legacy = applyLibraryCommand(legacy, { kind: "edit", expectedRevision: legacy.revision, entryId: entry.id, definition: { ...entry.definition, specifications: { width: { kind: "number", value: 0.8, unit: "m" } } } });
    legacy = applyLibraryCommand(legacy, { kind: "approve", expectedRevision: legacy.revision, entryIds: [entry.id] });
    legacy.excludedSourceParameterNames = ["location line"];
    const persisted = JSON.stringify(legacy);
    await writeFile(join(fixture.dataRoot, "catalog-library.json"), persisted);
    app = await createApp(fixture);
    const restored = catalogLibrarySchema.parse((await request(app).get("/api/catalog-library")).body);
    expect(restored).toEqual(legacy);
    expect(restored.entries[0]?.publication?.specifications.width).toEqual({ kind: "number", value: 0.8, unit: "m" });
    expect(await readFile(join(fixture.dataRoot, "catalog-library.json"), "utf8")).toBe(persisted);
  });
  it("validates complete creation metadata, rejects stale membership atomically, and confirms only the selected element", async () => {
    fixture = await libraryFixture();
    let app = await createApp(fixture);
    const model = LibraryModelsSchema.parse((await request(app).get("/api/models")).body)[0];
    if (!model) throw Error("Missing model");
    const analysis = { ...snapshot, modelId: model.id, fingerprint: model.fingerprint, sourceName: model.name };
    const index = CreationIndexSchema.parse({ schemaVersion: 1, modelId: model.id, fingerprint: model.fingerprint, candidates: analysis.types.map(type => ({ key: sourceObservationKey(type), identity: type.typeGlobalId === null ? { kind: "element", globalId: type.elementGlobalId } : { kind: "type", globalId: type.typeGlobalId }, name: type.name, ifcClass: type.ifcClass, categories: type.categories, classificationIssues: [], occurrenceIds: type.occurrenceIds, representativeId: type.occurrenceIds[0] })), stats: { elements: 4, candidates: 3, classified: 1, unclassified: 2, untyped: 2 } });
    await request(app).put(`/api/models/${model.id}/creation-index`).send(index).expect(200);
    const details = { name: "Reviewed element", ifcClass: "IFCFURNITURE", system: "Furniture", fdvuDocumentationUrl: "https://example.com/fdvu.pdf" };
    const imported = catalogLibrarySchema.parse((await request(app).post("/api/catalog-library/commands").send({ kind: "import-asset", expectedRevision: 0, snapshot: analysis, candidateKey: "element:element-a", details }).expect(200)).body);
    expect(imported.entries).toHaveLength(1);
    expect(imported.entries[0]?.status).toBe("draft");
    expect(imported.entries[0]?.sourceReferences[0]?.occurrenceIds).toEqual([3]);
    expect(imported.entries[0]?.definition).toMatchObject({ name: details.name, fdvuDocumentationUrl: details.fdvuDocumentationUrl,
      specifications: { "IFC Class": { kind: "text", value: details.ifcClass, unit: null }, System: { kind: "text", value: details.system, unit: null } } });
    const bytes = await readFile(join(fixture.dataRoot, "catalog-library.json"));
    await request(app).post("/api/catalog-library/commands").send({ kind: "import-asset", expectedRevision: imported.revision,
      snapshot: analysis, candidateKey: ["type:typed", "element:element-b"] }).expect(400);
    expect(await readFile(join(fixture.dataRoot, "catalog-library.json"))).toEqual(bytes);
    for (const altered of [ { ...analysis, fingerprint: "stale" }, { ...analysis, types: analysis.types.slice(1) }, { ...analysis, types: analysis.types.map(type => ({ ...type, occurrenceIds: [999] })) } ]) {
      await request(app).post("/api/catalog-library/commands").send({ kind: "import-asset", expectedRevision: imported.revision, snapshot: altered, candidateKey: "element:element-a" }).expect(altered.fingerprint === "stale" ? 409 : 400);
      expect(await readFile(join(fixture.dataRoot, "catalog-library.json"))).toEqual(bytes);
    }
    const entry = imported.entries[0];
    if (!entry) throw Error("Missing selected draft");
    const edit = { kind: "edit", expectedRevision: imported.revision, entryId: entry.id, definition: entry.definition, confirmedSourceReferences: entry.sourceReferences };
    await request(app).post("/api/catalog-library/commands").send(edit).expect(200);
    const current = catalogLibrarySchema.parse((await request(app).get("/api/catalog-library")).body);
    await request(app).post("/api/catalog-library/commands").send({ ...edit, expectedRevision: current.revision, confirmedSourceReferences: entry.sourceReferences.map(reference => ({ ...reference, occurrenceIds: [4] })) }).expect(400);
    app = await createApp(fixture);
    expect(catalogLibrarySchema.parse((await request(app).get("/api/catalog-library")).body)).toEqual(current);
  });
});
it("analyzes every real IFC candidate while retaining element identity", async () => {
  const reader = new IfcReader();
  try {
    await reader.initialize();
    reader.open(await readFile(new URL("./fixtures/assets.ifc", import.meta.url)), { id: "b3907523-463f-414b-8235-1d5e1cce0454", fingerprint: "fixture" }, undefined, "creation");
    const analysis = reader.analyzeAssets();
    expect(analysis.analysisVersion).toBe(3);
    expect(analysis.types.map(sourceObservationKey)).toEqual(reader.discoverAssets().candidates.map(candidate => candidate.key));
    expect(analysis.types.find(type => type.typeGlobalId === null)).toMatchObject({ elementGlobalId: "0000000000000000000033", occurrenceIds: [33] });
  } finally { reader.dispose(); }
});
