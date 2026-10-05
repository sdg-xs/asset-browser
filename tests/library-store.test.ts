import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
