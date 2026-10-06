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
    const imported = catalogLibrarySchema.parse((await request(app).post("/api/catalog-library/commands").send({ kind: "import-selected", expectedRevision: 0, snapshot: analysis, candidateKeys: ["element:element-a"] }).expect(200)).body);
    const bytes = await readFile(join(fixture.dataRoot, "catalog-library.json"));
    for (const altered of [ { ...analysis, fingerprint: "stale" }, { ...analysis, types: analysis.types.slice(1) }, { ...analysis, types: analysis.types.map(type => ({ ...type, occurrenceIds: [999] })) } ]) {
      await request(app).post("/api/catalog-library/commands").send({ kind: "import-selected", expectedRevision: imported.revision, snapshot: altered, candidateKeys: ["element:element-a"] }).expect(altered.fingerprint === "stale" ? 409 : 400);
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
