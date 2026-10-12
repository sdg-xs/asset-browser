import { appendFile, cp, mkdir, readFile, stat, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LibraryStore } from "../server/library-store.js";
import { emptyIndex, libraryFixture } from "./library-fixtures.js";

describe("persistent local IFC store", () => {
  let fixture: Awaited<ReturnType<typeof libraryFixture>>;
  beforeEach(async () => {
    fixture = await libraryFixture();
  });
  afterEach(async () => {
    await fixture.cleanup();
  });
  const open = () => LibraryStore.create(fixture);

  it("retains indexed revision bindings when cloud sync drops only subsecond timestamp precision", async () => {
    await utimes(fixture.sourcePath, 1_700_000_000.789, 1_700_000_000.789);
    const store = await open();
    const [model] = await store.listModels();
    if (!model) throw new Error("Expected discovered model");
    await store.saveIndex(model.id, emptyIndex(model));
    const info = await stat(fixture.sourcePath);
    await utimes(fixture.sourcePath, info.atime, Math.floor(info.mtimeMs / 1000));
    const synced = await open();
    expect(await synced.listModels()).toEqual([{ ...model, index: emptyIndex(model) }]);
    const opened = await synced.openModelFile(model.id, model.fingerprint);
    try {
      expect(opened.fingerprint).toBe(model.fingerprint);
      expect(await opened.file.readFile()).toEqual(fixture.ifc);
    } finally {
      await opened.file.close();
    }
    expect(await synced.withCurrentModels(
      [{ modelId: model.id, fingerprint: model.fingerprint }],
      models => Promise.resolve(models[0]?.id),
    )).toBe(model.id);
    await utimes(fixture.sourcePath, info.atime, Math.floor(info.mtimeMs / 1000) + 1);
    expect((await synced.listModels())[0]?.index).toBeNull();
    await expect(synced.openModelFile(model.id, model.fingerprint))
      .rejects.toMatchObject({ code: "SOURCE_CHANGED" });
  });

  it("keeps indexed source identities and uploaded bytes when synced folders move to another device", async () => {
    const store = await open();
    const [model] = await store.listModels();
    if (!model) throw new Error("Expected discovered model");
    await store.saveIndex(model.id, emptyIndex(model));
    const temporaryPath = await store.createUploadDestination();
    await writeFile(temporaryPath, fixture.ifc);
    const upload = await store.persistUpload({ temporaryPath, name: "synced.ifc" });
    const deviceRoot = join(dirname(fixture.sourceRoot), "other-device");
    await mkdir(deviceRoot);
    const sourceRoot = join(deviceRoot, "sources");
    const dataRoot = join(deviceRoot, "managed");
    await cp(fixture.sourceRoot, sourceRoot, { recursive: true, preserveTimestamps: true });
    await cp(fixture.dataRoot, dataRoot, { recursive: true, preserveTimestamps: true });
    const synced = await LibraryStore.create({ sourceRoot, dataRoot });
    const models = await synced.listModels();
    expect(models.map(item => item.id).sort()).toEqual([model.id, upload.id].sort());
    expect(await readFile(await synced.resolveModelFile(upload.id))).toEqual(fixture.ifc);
    const saved = JSON.parse(await readFile(join(dataRoot, "library.json"), "utf8"));
    expect(saved.entries.find((entry: { model: { id: string } }) => entry.model.id === model.id).path)
      .toBe("BS19/IFC/BS19.ifc");
  });

  it.runIf(process.platform === "win32")("migrates legacy paths from the previous Windows profile without losing saved indexes or hidden sources", async () => {
    const store = await open();
    const [model] = await store.listModels();
    if (!model) throw new Error("Expected discovered model");
    await store.saveIndex(model.id, emptyIndex(model));
    await store.hideModel(model.id);
    const temporaryPath = await store.createUploadDestination();
    await writeFile(temporaryPath, fixture.ifc);
    const upload = await store.persistUpload({ temporaryPath, name: "synced.ifc" });
    const statePath = join(fixture.dataRoot, "library.json");
    const saved = JSON.parse(await readFile(statePath, "utf8"));
    for (const entry of saved.entries) {
      const root = entry.model.source === "existing" ? fixture.sourceRoot : join(fixture.dataRoot, "uploads");
      const localPath = entry.model.id === model.id ? fixture.sourcePath : await store.resolveModelFile(upload.id);
      entry.path = localPath.replace(/^([a-z]:[\\/]Users[\\/])[^\\/]+/i, "$1PreviousDevice");
      expect(entry.path).not.toContain(root);
    }
    await writeFile(statePath, JSON.stringify(saved));
    const synced = await open();
    expect((await synced.listModels()).map(item => item.id)).toEqual([upload.id]);
    expect(await readFile(await synced.resolveModelFile(upload.id))).toEqual(fixture.ifc);
    const migrated = JSON.parse(await readFile(statePath, "utf8"));
    expect(migrated.entries.find((entry: { model: { id: string } }) => entry.model.id === model.id))
      .toMatchObject({ hidden: true, model: { id: model.id, index: emptyIndex(model) }, path: "BS19/IFC/BS19.ifc" });
  });

  it("rejects saved relative paths that escape the configured root", async () => {
    const store = await open();
    await store.listModels();
    const statePath = join(fixture.dataRoot, "library.json");
    const saved = JSON.parse(await readFile(statePath, "utf8"));
    saved.entries[0].path = "../outside.ifc";
    await writeFile(statePath, JSON.stringify(saved));
    await expect(open()).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("allows startup with a missing configured source root", async () => {
    const store = await LibraryStore.create({
      sourceRoot: join(fixture.sourceRoot, "missing"),
      dataRoot: fixture.dataRoot,
    });
    expect(await store.listModels()).toEqual([]);
  });

  it("discovers existing source files and keeps identity across restarts", async () => {
    const store = await open();
    const [model] = await store.listModels();
    expect(model).toMatchObject({
      name: "BS19.ifc",
      source: "existing",
      size: fixture.ifc.length,
      index: null,
    });
    expect(await (await open()).listModels()).toEqual([model]);
  });

  it("persists hidden state without deleting or modifying original bytes", async () => {
    const store = await open();
    const [model] = await store.listModels();
    if (!model) throw new Error("Expected discovered model");
    await store.hideModel(model.id);
    expect(await (await open()).listModels()).toEqual([]);
    expect(await readFile(fixture.sourcePath)).toEqual(fixture.ifc);
    await expect(store.resolveModelFile(model.id)).rejects.toMatchObject({
      code: "MODEL_NOT_FOUND",
    });
  });

  it("persists matching indexes and invalidates them when source revision changes", async () => {
    const store = await open();
    const [model] = await store.listModels();
    if (!model) throw new Error("Expected discovered model");
    await store.saveIndex(model.id, emptyIndex(model));
    expect((await (await open()).listModels())[0]?.index).toEqual(
      emptyIndex(model),
    );
    await appendFile(fixture.sourcePath, "\n/* source revision */");
    const [updated] = await store.listModels();
    expect(updated?.id).toBe(model.id);
    expect(updated?.fingerprint).not.toBe(model.fingerprint);
    expect(updated?.index).toBeNull();
    await expect(
      store.saveIndex(model.id, emptyIndex(model)),
    ).rejects.toMatchObject({ code: "STALE_INDEX" });
  });

  it("retains two concurrent same-named uploads with distinct files after restart", async () => {
    const store = await open();
    const upload = async () => {
      const temporaryPath = await store.createUploadDestination();
      await writeFile(temporaryPath, fixture.ifc);
      return store.persistUpload({ temporaryPath, name: "same.ifc" });
    };
    const [one, two] = await Promise.all([upload(), upload()]);
    expect(one.id).not.toBe(two.id);
    const restarted = await open();
    expect(
      (await restarted.listModels()).filter(
        (model) => model.source === "upload",
      ),
    ).toHaveLength(2);
    expect(await restarted.resolveModelFile(one.id)).not.toBe(
      await restarted.resolveModelFile(two.id),
    );
    expect(await readFile(await restarted.resolveModelFile(two.id))).toEqual(
      fixture.ifc,
    );
  });

  it("rejects malformed IFC uploads without publishing them", async () => {
    const store = await open();
    const temporaryPath = await store.createUploadDestination();
    await writeFile(
      temporaryPath,
      "ISO-10303-21; HEADER; FILE_SCHEMA(('NOT_IFC')); ENDSEC;",
    );
    await expect(
      store.persistUpload({ temporaryPath, name: "fake.ifc" }),
    ).rejects.toMatchObject({ code: "INVALID_IFC" });
    expect(
      (await (await open()).listModels()).filter(
        (model) => model.source === "upload",
      ),
    ).toEqual([]);
  });
});
