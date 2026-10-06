import request from "supertest";
import { mkdir, readFile, readdir, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app.js";
import { LibraryModelsSchema } from "../shared/contracts.js";
import {
  catalogLibrarySchema,
  type CatalogLibrary,
  type LibraryCommand,
  type LibrarySnapshot,
} from "../shared/catalog-library.js";
import { emptyIndex, libraryFixture } from "./library-fixtures.js";
import { CatalogLibraryStore } from "../server/catalog-library-store.js";
import { LibraryStore } from "../server/library-store.js";

describe("persistent curated catalog API", () => {
  let fixture: Awaited<ReturnType<typeof libraryFixture>>;
  let app: Awaited<ReturnType<typeof createApp>>;
  let snapshot: LibrarySnapshot;
  beforeEach(async () => {
    fixture = await libraryFixture();
    app = await createApp(fixture);
    const [model] = LibraryModelsSchema.parse(
      (await request(app).get("/api/models")).body,
    );
    if (!model) throw new Error("Expected model");
    snapshot = {
      modelId: model.id,
      fingerprint: model.fingerprint,
      sourceName: model.name,
      types: [
        {
          typeGlobalId: "type-a",
          name: "Cabinet",
          ifcClass: "IfcFurnitureType",
          categories: ["Cabinets"],
          occurrenceIds: [1, 2],
          fields: [],
        },
        {
          typeGlobalId: "type-b",
          name: "Cabinet",
          ifcClass: "IfcFurnitureType",
          categories: ["Cabinets"],
          occurrenceIds: [3],
          fields: [],
        },
      ],
    };
    await request(app)
      .put(`/api/models/${model.id}/index`)
      .send({
        ...emptyIndex(model),
        types: snapshot.types.map((type) => ({
          ...type,
          id: type.typeGlobalId,
          modelId: model.id,
          representativeId: type.occurrenceIds[0],
        })),
      })
      .expect(200);
  });
  afterEach(async () => fixture.cleanup());
  async function read(): Promise<CatalogLibrary> {
    return catalogLibrarySchema.parse(
      (await request(app).get("/api/catalog-library").expect(200)).body,
    );
  }
  async function command(value: LibraryCommand, status = 200) {
    return request(app)
      .post("/api/catalog-library/commands")
      .send(value)
      .expect(status);
  }
  async function imported() {
    return catalogLibrarySchema.parse(
      (await command({ kind: "import", expectedRevision: 0, snapshot })).body,
    );
  }
  it("persists source parameter exclusions without altering IFC observations or retained parameters", async () => {
    const type = snapshot.types[0];
    if (!type) throw Error("Missing fixture type");
    type.fields = ["Comments", "Location Line"].map((name) => ({
      key: JSON.stringify(["Identity Data", name]), pset: "Identity Data", name,
      measure: "IFCLABEL", unit: null,
      values: [{ rawValue: "Example", sourceUnit: null, sourceMeasure: "IFCLABEL", normalized: { kind: "text", value: "Example", unit: null }, occurrenceIds: [1, 2] }],
    }));
    const original = await imported();
    const updated = catalogLibrarySchema.parse((await command({
      kind: "exclude-source-parameters", expectedRevision: original.revision, names: ["Location Line"],
    })).body);
    expect(updated.sources).toEqual(original.sources);
    expect(updated.templates[0]?.suggestions.map((field) => field.label)).toEqual(["Comments"]);
    expect(updated.excludedSourceParameterNames).toEqual(["location line"]);
    app = await createApp(fixture);
    expect(await read()).toEqual(updated);
  });
  it("starts empty, persists imports, and leaves original inventory bytes unchanged", async () => {
    expect((await read()).revision).toBe(0);
    const original = await readFile(join(fixture.dataRoot, "library.json"));
    const state = await imported();
    expect(state.entries).toHaveLength(2);
    expect(await readFile(join(fixture.dataRoot, "library.json"))).toEqual(
      original,
    );
    app = await createApp(fixture);
    expect(await read()).toEqual(state);
    expect(await readdir(fixture.dataRoot)).not.toContain(
      expect.stringMatching(/catalog-library\..*\.tmp/),
    );
  });
  it("rejects malformed requests and preserves localhost restrictions", async () => {
    await request(app)
      .post("/api/catalog-library/commands")
      .send({ kind: "import" })
      .expect(400);
    await request(app)
      .post("/api/catalog-library/commands")
      .set("Origin", "https://evil.example")
      .send({ kind: "import", expectedRevision: 0, snapshot })
      .expect(403);
    await request(app)
      .get("/api/catalog-library")
      .set("Host", "evil.example")
      .expect(403);
    await request(app).get("/api/catalog-library?path=secret").expect(400);
    expect((await read()).revision).toBe(0);
  });
  it("serializes simultaneous decisions with one winner and rejects stale retries", async () => {
    const state = await imported();
    const decisions = state.entries.map(
      (entry) =>
        ({
          kind: "archive",
          expectedRevision: state.revision,
          entryIds: [entry.id],
        }) satisfies LibraryCommand,
    );
    const responses = await Promise.all(
      decisions.map((value) =>
        request(app).post("/api/catalog-library/commands").send(value),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      (await read()).entries.filter((entry) => entry.status === "archived"),
    ).toHaveLength(1);
    const first = decisions[0];
    if (!first) throw new Error("Expected decision");
    const stale = await command(first, 409);
    expect(stale.body).toMatchObject({ error: { code: "REVISION_CONFLICT" } });
  });
  it("repeat complete imports are idempotent", async () => {
    const state = await imported();
    expect(
      catalogLibrarySchema.parse(
        (
          await command({
            kind: "import",
            expectedRevision: state.revision,
            snapshot,
          })
        ).body,
      ),
    ).toEqual(state);
  });
  it.each(["model", "type", "membership", "incomplete", "class"])(
    "rejects forged %s snapshots atomically",
    async (mode) => {
      const forged = structuredClone(snapshot);
      const type = forged.types[0];
      if (!type) throw new Error("Expected type");
      if (mode === "model")
        forged.modelId = "00000000-0000-4000-8000-000000000000";
      if (mode === "type") type.typeGlobalId = "forged";
      if (mode === "membership") type.occurrenceIds = [3];
      if (mode === "incomplete") forged.types.pop();
      if (mode === "class") type.ifcClass = "IfcPumpType";
      const response = await request(app)
        .post("/api/catalog-library/commands")
        .send({ kind: "import", expectedRevision: 0, snapshot: forged });
      expect([400, 404]).toContain(response.status);
      expect((await read()).revision).toBe(0);
    },
  );
  it("rejects a changed disk revision with 409 even with the old cached index", async () => {
    await writeFile(
      fixture.sourcePath,
      Buffer.concat([fixture.ifc, Buffer.from("\nchanged")]),
    );
    const response = await command(
      { kind: "import", expectedRevision: 0, snapshot },
      409,
    );
    expect(response.body).toMatchObject({ error: { code: "SOURCE_CHANGED" } });
    expect((await read()).revision).toBe(0);
  });
  it("keeps approval atomic, retains approved entries after hiding source, and restores archives across restart", async () => {
    let state = await imported();
    const [entry, incomplete] = state.entries;
    if (!entry || !incomplete) throw new Error("Expected entries");
    state = catalogLibrarySchema.parse((await command({
      kind: "edit",
      expectedRevision: state.revision,
      entryId: incomplete.id,
      definition: { ...incomplete.definition, categoryId: null },
    })).body);
    state = catalogLibrarySchema.parse(
      (
        await command({
          kind: "edit",
          expectedRevision: state.revision,
          entryId: entry.id,
          definition: {
            ...entry.definition,
            specifications: {
              width: { kind: "number", value: 0.8, unit: "m" },
            },
          },
        })
      ).body,
    );
    await command(
      {
        kind: "approve",
        expectedRevision: state.revision,
        entryIds: [entry.id, incomplete.id],
        resolveConflictsAsUnknown: true,
      },
      400,
    );
    expect(await read()).toEqual(state);
    state = catalogLibrarySchema.parse(
      (
        await command({
          kind: "approve",
          expectedRevision: state.revision,
          entryIds: [entry.id],
        })
      ).body,
    );
    await request(app).delete(`/api/models/${snapshot.modelId}`).expect(204);
    expect(await read()).toEqual(state);
    state = catalogLibrarySchema.parse(
      (
        await command({
          kind: "archive",
          expectedRevision: state.revision,
          entryIds: [entry.id],
        })
      ).body,
    );
    app = await createApp(fixture);
    state = catalogLibrarySchema.parse(
      (
        await command({
          kind: "restore",
          expectedRevision: state.revision,
          entryIds: [entry.id],
        })
      ).body,
    );
    expect(state.entries.find((value) => value.id === entry.id)?.status).toBe(
      "draft",
    );
  });
  it("checks explicit reference rebinding against visible inventory, not cached catalog observations", async () => {
    const state = await imported();
    const entry = state.entries[0];
    if (!entry) throw new Error("Expected entry");
    await request(app).delete(`/api/models/${snapshot.modelId}`).expect(204);
    await command(
      {
        kind: "edit",
        expectedRevision: state.revision,
        entryId: entry.id,
        definition: entry.definition,
        confirmedSourceReferences: entry.sourceReferences,
      },
      404,
    );
    expect(await read()).toEqual(state);
  });
  it("rejects invalid explicit occurrence references without writing", async () => {
    const state = await imported();
    const entry = state.entries[0];
    const reference = entry?.sourceReferences[0];
    if (!entry || !reference) throw new Error("Expected reference");
    await command(
      {
        kind: "edit",
        expectedRevision: state.revision,
        entryId: entry.id,
        definition: entry.definition,
        confirmedSourceReferences: [{ ...reference, occurrenceIds: [3] }],
      },
      400,
    );
    expect(await read()).toEqual(state);
  });
  it("rejects rebinding when a current index no longer contains cached catalog memberships", async () => {
    const state = await imported();
    const entry = state.entries[0];
    const [model] = LibraryModelsSchema.parse(
      (await request(app).get("/api/models")).body,
    );
    if (!entry || !model || !model.index) throw new Error("Expected source");
    const index = structuredClone(model.index);
    const type = index.types[0];
    if (!type) throw new Error("Expected type");
    type.occurrenceIds = [90];
    type.representativeId = 90;
    await request(app)
      .put(`/api/models/${model.id}/index`)
      .send(index)
      .expect(200);
    await command(
      {
        kind: "edit",
        expectedRevision: state.revision,
        entryId: entry.id,
        definition: entry.definition,
        confirmedSourceReferences: entry.sourceReferences,
      },
      400,
    );
    expect(await read()).toEqual(state);
  });
  it("does not interleave a source hide with validated catalog publication", async () => {
    const models = await LibraryStore.create(fixture);
    let release: () => void = () => {
      throw new Error("Gate not initialized");
    };
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered: () => void = () => {
      throw new Error("Entry not initialized");
    };
    const entryGate = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const catalog = await CatalogLibraryStore.create({
      dataRoot: fixture.dataRoot,
    });
    const publication = models.withCurrentModels(
      [{ modelId: snapshot.modelId, fingerprint: snapshot.fingerprint }],
      async () => {
        entered();
        await gate;
        return catalog.execute({
          kind: "category",
          expectedRevision: 0,
          id: "category",
          name: "Cabinets",
          aliases: [],
        });
      },
    );
    await entryGate;
    let hidden = false;
    const hide = models.hideModel(snapshot.modelId).then(() => {
      hidden = true;
    });
    await Promise.resolve();
    expect(hidden).toBe(false);
    release();
    expect((await publication).revision).toBe(1);
    await hide;
    expect(await models.listModels()).toEqual([]);
    await expect(
      models.withCurrentModels(
        [{ modelId: snapshot.modelId, fingerprint: snapshot.fingerprint }],
        async () => undefined,
      ),
    ).rejects.toMatchObject({ code: "MODEL_NOT_FOUND", status: 404 });
  });
  it("keeps memory unchanged after an atomic rename failure and permits a later command", async () => {
    const store = await CatalogLibraryStore.create({
      dataRoot: fixture.dataRoot,
    });
    const destination = join(fixture.dataRoot, "catalog-library.json");
    await mkdir(destination);
    const value: LibraryCommand = {
      kind: "category",
      expectedRevision: 0,
      id: "category",
      name: "Cabinets",
      aliases: [],
    };
    await expect(store.execute(value)).rejects.toThrow();
    expect((await store.read()).revision).toBe(0);
    expect(
      (await readdir(fixture.dataRoot)).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
    await rmdir(destination);
    const saved = await store.execute(value);
    saved.categories.length = 0;
    expect((await store.read()).categories).toHaveLength(1);
    await expect(
      (await CatalogLibraryStore.create({ dataRoot: fixture.dataRoot })).read(),
    ).resolves.toMatchObject({ revision: 1 });
  });
  it("refuses corrupt persisted catalogs without replacing the original bytes", async () => {
    const path = join(fixture.dataRoot, "catalog-library.json");
    const corrupt = '{"schemaVersion":99}';
    await writeFile(path, corrupt);
    await expect(createApp(fixture)).rejects.toThrow(/catalog-library.json/);
    expect(await readFile(path, "utf8")).toBe(corrupt);
  });
  it("serializes racing hide and import into either a valid saved snapshot or an unchanged catalog", async () => {
    const [hide, imported] = await Promise.all([
      request(app).delete(`/api/models/${snapshot.modelId}`),
      request(app)
        .post("/api/catalog-library/commands")
        .send({ kind: "import", expectedRevision: 0, snapshot }),
    ]);
    expect(hide.status).toBe(204);
    expect([200, 404]).toContain(imported.status);
    const state = await read();
    expect(state.revision).toBe(imported.status === 200 ? 1 : 0);
    expect(state.entries).toHaveLength(imported.status === 200 ? 2 : 0);
    await command(
      { kind: "import", expectedRevision: state.revision, snapshot },
      404,
    );
  });

  it("retains hidden historical provenance while selecting a visible preferred source", async () => {
    let state = await imported();
    const uploaded = await request(app)
      .post("/api/models")
      .attach("file", fixture.ifc, "B.ifc")
      .expect(201);
    const model = LibraryModelsSchema.parse([uploaded.body])[0];
    if (!model) throw Error("fixture model");
    const second = {
      ...snapshot,
      modelId: model.id,
      fingerprint: model.fingerprint,
      sourceName: model.name,
    };
    await request(app)
      .put(`/api/models/${model.id}/index`)
      .send({
        ...emptyIndex(model),
        types: second.types.map((t) => ({
          ...t,
          id: t.typeGlobalId,
          modelId: model.id,
          representativeId: t.occurrenceIds[0],
        })),
      })
      .expect(200);
    state = catalogLibrarySchema.parse(
      (
        await command({
          kind: "import",
          expectedRevision: state.revision,
          snapshot: second,
        })
      ).body,
    );
    const target = state.entries[0],
      other = state.entries[2];
    if (!target || !other) throw Error("fixture entries");
    state = catalogLibrarySchema.parse(
      (
        await command({
          kind: "merge",
          expectedRevision: state.revision,
          targetId: target.id,
          absorbedIds: [other.id],
        })
      ).body,
    );
    const merged = state.entries[0];
    if (!merged) throw Error("merged");
    const old = merged.sourceReferences[0],
      visible = merged.sourceReferences[1];
    if (!old || !visible) throw Error("references");
    // A merged definition can retain two partitions from different revisions of B.
    visible.occurrenceIds = [1];
    const historical = {
      ...visible,
      fingerprint: "prior-B-revision",
      occurrenceIds: [2],
    };
    merged.sourceReferences.push(historical);
    await writeFile(
      join(fixture.dataRoot, "catalog-library.json"),
      JSON.stringify(state),
    );
    app = await createApp(fixture);
    await request(app).delete(`/api/models/${snapshot.modelId}`).expect(204);
    state = catalogLibrarySchema.parse(
      (
        await command({
          kind: "edit",
          expectedRevision: state.revision,
          entryId: merged.id,
          definition: merged.definition,
          confirmedSourceReferences: [visible, old, historical],
        })
      ).body,
    );
    expect(state.entries[0]?.sourceReferences).toEqual([
      visible,
      old,
      historical,
    ]);
    app = await createApp(fixture);
    expect((await read()).entries[0]?.sourceReferences).toEqual([
      visible,
      old,
      historical,
    ]);
    const consolidated = { ...visible, occurrenceIds: [1, 2] };
    state = catalogLibrarySchema.parse(
      (
        await command({
          kind: "edit",
          expectedRevision: state.revision,
          entryId: merged.id,
          definition: merged.definition,
          confirmedSourceReferences: [consolidated, old],
          sourceRebindings: [
            {
              sourceId: historical.sourceId,
              fromFingerprint: historical.fingerprint,
              toFingerprint: visible.fingerprint,
              occurrenceIds: [2],
            },
          ],
        })
      ).body,
    );
    expect(state.entries[0]?.sourceReferences).toEqual([consolidated, old]);
    app = await createApp(fixture);
    expect((await read()).entries[0]?.sourceReferences).toEqual([
      consolidated,
      old,
    ]);
    await command(
      {
        kind: "edit",
        expectedRevision: state.revision,
        entryId: merged.id,
        definition: merged.definition,
        confirmedSourceReferences: [consolidated, { ...old, equivalent: true }],
      },
      404,
    );
  });
});
