import request from "supertest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { IfcReader } from "../src/ifc/reader.js";
import { createApp } from "../server/app.js";
import { LibraryModelsSchema } from "../shared/contracts.js";
import { catalogLibrarySchema, type LibrarySnapshot, type ObservedField } from "../shared/catalog-library.js";
import { applyLibraryCommand, emptyCatalogLibrary, entryIssues } from "../shared/catalog-rules.js";
import { sourceObservationKey } from "../shared/catalog-source-identity.js";
import { libraryFixture } from "./library-fixtures.js";

let fixture: Awaited<ReturnType<typeof libraryFixture>> | undefined;
afterEach(async () => fixture?.cleanup());
describe("creation final integration regressions", () => {
  it.each([
    { location: "type", before: "'Identity Data',$,(#40)", after: "'Identity Data',$,(#40,#44)", occurrence: 31, values: ["Air quality sensor", "Temperature sensor"] },
    { location: "instance", before: "'Identity Data',$,(#44)", after: "'Identity Data',$,(#44,#50)", occurrence: 30, values: ["Temperature sensor", "NA"] },
    { location: "blank instance", before: "'Identity Data',$,(#44)", after: "'Identity Data',$,(#44,#47)", occurrence: 30, values: ["Temperature sensor", ""] },
  ])("retains $location classification ambiguity through selective HTTP import, staff correction and approval", async variant => {
    fixture = await libraryFixture();
    const text = (await readFile(new URL("./fixtures/assets.ifc", import.meta.url), "utf8")).replace(variant.before, variant.after);
    await writeFile(fixture.sourcePath, text);
    const app = await createApp(fixture);
    const model = LibraryModelsSchema.parse((await request(app).get("/api/models")).body)[0];
    if (!model) throw Error("Missing model");
    const reader = new IfcReader();
    try {
      await reader.initialize();
      reader.open(new TextEncoder().encode(text), model, undefined, "creation");
      const index = reader.discoverAssets();
      const candidate = index.candidates.find(c => c.identity.kind === "type");
      if (!candidate) throw Error("Missing typed candidate");
      expect(candidate.classificationIssues.length).toBeGreaterThan(0);
      const snapshot = reader.analyzeAssets();
      const observation = snapshot.types.find(type => sourceObservationKey(type) === candidate.key);
      const field = observation?.fields.find(f => f.pset === "Identity Data" && f.name === "Generic Hard Asset");
      expect(field?.values.filter(v => v.occurrenceIds.includes(variant.occurrence)).map(v => v.rawValue).sort()).toEqual([...variant.values].sort());
      await request(app).put(`/api/models/${model.id}/creation-index`).send(index).expect(200);
      for (const issues of [undefined, ["Forged classification issue"]]) {
        const invalid = structuredClone(snapshot);
        const target = invalid.types.find(type => sourceObservationKey(type) === candidate.key);
        if (!target) throw Error("Missing candidate observation");
        target.classificationIssues = issues;
        await request(app).post("/api/catalog-library/commands").send({ kind: "import-selected", expectedRevision: 0, snapshot: invalid, candidateKeys: [candidate.key] }).expect(400);
        expect(catalogLibrarySchema.parse((await request(app).get("/api/catalog-library")).body)).toEqual(emptyCatalogLibrary());
      }
      const imported = catalogLibrarySchema.parse((await request(app).post("/api/catalog-library/commands").send({ kind: "import-selected", expectedRevision: 0, snapshot, candidateKeys: [candidate.key] }).expect(200)).body);
      expect(imported.sources).toHaveLength(index.candidates.length);
      expect(imported.entries).toHaveLength(1);
      const entry = imported.entries[0];
      if (!entry) throw Error("Missing draft");
      expect(entry.definition.categoryId).toBeNull();
      expect(entryIssues(imported, entry)).toContain("Canonical category is required.");
      await request(app).post("/api/catalog-library/commands").send({ kind: "approve", expectedRevision: imported.revision, entryIds: [entry.id] }).expect(400);
      const category = imported.categories[0];
      if (!category) throw Error("Missing staff category choice");
      const edited = catalogLibrarySchema.parse((await request(app).post("/api/catalog-library/commands").send({ kind: "edit", expectedRevision: imported.revision, entryId: entry.id, definition: { ...entry.definition, categoryId: category.id } }).expect(200)).body);
      expect(edited.entries[0]?.status).toBe("draft");
      const approved = catalogLibrarySchema.parse((await request(app).post("/api/catalog-library/commands").send({ kind: "approve", expectedRevision: edited.revision, entryIds: [entry.id], resolveConflictsAsUnknown: true }).expect(200)).body);
      expect(approved.entries[0]?.status).toBe("approved");
      expect(approved.sources).toEqual(imported.sources);
      expect(() => reader.open(new TextEncoder().encode(text), model)).toThrow(/Conflicting/);
    } finally { reader.dispose(); }
  });

  it("keeps ambiguity overlap restricted to distinct creation classification evidence values", () => {
    const values = ["Temperature sensor", "Air quality sensor"].map(rawValue => ({ rawValue, normalized: { kind: "text", value: rawValue, unit: null }, occurrenceIds: [1] } satisfies ObservedField["values"][number]));
    const first = values[0]; const second = values[1];
    if (!first || !second) throw Error("Missing evidence values");
    const snapshot = { analysisVersion: 3, modelId: "model", sourceName: "Fixture.ifc", fingerprint: "v1", types: [{ typeGlobalId: "type", name: "Sensor", ifcClass: "IFCBUILDINGELEMENTPROXYTYPE", categories: [], classificationIssues: ["Conflicting Generic Hard Asset values"], occurrenceIds: [1], fields: [{ key: JSON.stringify(["Identity Data", "Generic Hard Asset"]), pset: "Identity Data", name: "Generic Hard Asset", measure: "IFCLABEL", unit: null, values }] }] } satisfies LibrarySnapshot;
    const execute = (analysis: LibrarySnapshot) => applyLibraryCommand(emptyCatalogLibrary(), { kind: "import-selected", expectedRevision: 0, snapshot: analysis, candidateKeys: ["type:type"] });
    expect(execute(snapshot).entries).toHaveLength(1);
    const variants: LibrarySnapshot[] = [
      { ...snapshot, types: snapshot.types.map(type => ({ ...type, classificationIssues: undefined })) },
      { ...snapshot, types: snapshot.types.map(type => ({ ...type, fields: type.fields.map(field => ({ ...field, name: "Comments" })) })) },
      { ...snapshot, types: snapshot.types.map(type => ({ ...type, fields: type.fields.map(field => ({ ...field, values: [first, first] })) })) },
      { ...snapshot, types: snapshot.types.map(type => ({ ...type, fields: type.fields.map(field => ({ ...field, values: field.values.map(value => ({ ...value, occurrenceIds: [1, 1] })) })) })) },
      { ...snapshot, types: snapshot.types.map(type => ({ ...type, fields: type.fields.map(field => ({ ...field, values: field.values.map(value => ({ ...value, occurrenceIds: [999] })) })) })) },
      { ...snapshot, types: snapshot.types.map(type => ({ ...type, fields: type.fields.map(field => ({ ...field, name: "Comments", values: [{ ...first, normalized: { kind: "missing" } }, second] })) })) },
    ];
    for (const invalid of variants) expect(() => execute(invalid)).toThrow();
    expect(() => applyLibraryCommand(emptyCatalogLibrary(), { kind: "import", expectedRevision: 0, snapshot: { ...snapshot, analysisVersion: 2 } })).toThrow(/membership/);
    const missing = { ...snapshot, types: snapshot.types.map(type => ({ ...type, fields: type.fields.map(field => ({ ...field, values: [{ ...first, rawValue: "", normalized: { kind: "missing" } }, second] })) })) } satisfies LibrarySnapshot;
    expect(execute(missing).sources[0]?.observation.fields[0]?.values).toHaveLength(2);
    expect(() => applyLibraryCommand(emptyCatalogLibrary(), { kind: "import", expectedRevision: 0, snapshot: { ...missing, analysisVersion: 2 } })).toThrow(/membership/);
  });

  it("accepts a complete selected command above 32 MiB only on the bounded command endpoint", async () => {
    fixture = await libraryFixture();
    const app = await createApp(fixture);
    const model = LibraryModelsSchema.parse((await request(app).get("/api/models")).body)[0];
    if (!model) throw Error("Missing model");
    const reader = new IfcReader();
    try {
      await reader.initialize();
      reader.open(await readFile(new URL("./fixtures/assets.ifc", import.meta.url)), model, undefined, "creation");
      const index = reader.discoverAssets();
      const snapshot = reader.analyzeAssets();
      const selected = snapshot.types[0];
      if (!selected) throw Error("Missing candidate");
      const largeText = "x".repeat(17 * 1024 * 1024);
      selected.fields.push({ key: "large-comments", pset: "Fixture", name: "Comments", measure: "IFCLABEL", unit: null, values: [{ rawValue: largeText, normalized: { kind: "text", value: largeText, unit: null }, occurrenceIds: selected.occurrenceIds }] });
      const command = { kind: "import-selected", expectedRevision: 0, snapshot, candidateKeys: [sourceObservationKey(selected)] };
      expect(Buffer.byteLength(JSON.stringify(command))).toBeGreaterThan(32 * 1024 * 1024);
      await request(app).put(`/api/models/${model.id}/creation-index`).send(index).expect(200);
      await request(app).put(`/api/models/${model.id}/creation-index`).send(command).expect(413);
      const imported = catalogLibrarySchema.parse((await request(app).post("/api/catalog-library/commands").send(command).expect(200)).body);
      expect(imported.entries).toHaveLength(1);
      expect(imported.sources).toHaveLength(snapshot.types.length);
      const catalogPath = join(fixture.dataRoot, "catalog-library.json");
      const digest = async () => createHash("sha256").update(await readFile(catalogPath)).digest("hex");
      const saved = await digest();
      await request(app).post("/api/catalog-library/commands").send(command).expect(409);
      expect(await digest()).toBe(saved);
      const tooLarge = JSON.stringify({ extra: "x".repeat(64 * 1024 * 1024) });
      await request(app).post("/api/catalog-library/commands").set("Content-Type", "application/json").send(tooLarge).expect(413);
      expect(await digest()).toBe(saved);
    } finally { reader.dispose(); }
  }, 30000);
});
