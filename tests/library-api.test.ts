import request from "supertest";
import { createServer } from "vite";
import viteConfig from "../vite.config.js";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app.js";
import {
  LibraryModelsSchema,
  LibraryModelSchema,
} from "../shared/contracts.js";
import { emptyIndex, libraryFixture } from "./library-fixtures.js";

describe("localhost library API", () => {
  let fixture: Awaited<ReturnType<typeof libraryFixture>>;
  let app: Awaited<ReturnType<typeof createApp>>;
  beforeEach(async () => {
    fixture = await libraryFixture();
    app = await createApp(fixture);
  });
  afterEach(async () => {
    await fixture.cleanup();
  });
  async function firstModel() {
    const response = await request(app).get("/api/models").expect(200);
    const [model] = LibraryModelsSchema.parse(response.body);
    if (!model) throw new Error("Expected discovered model");
    return model;
  }

  it("reports health and streams exact source bytes by model ID", async () => {
    await request(app).get("/api/health").expect(200, { status: "ok" });
    const model = await firstModel();
    const response = await request(app)
      .get(`/api/models/${model.id}/file`)
      .expect(200);
    expect(response.text).toBe(fixture.ifc.toString());
  });

  it("persists multipart uploads across app restarts", async () => {
    const response = await request(app)
      .post("/api/models")
      .attach("file", fixture.ifc, "new.ifc")
      .expect(201);
    const model = LibraryModelSchema.parse(response.body);
    const restarted = await createApp(fixture);
    const listed = LibraryModelsSchema.parse(
      (await request(restarted).get("/api/models").expect(200)).body,
    );
    expect(listed.find((item) => item.id === model.id)).toEqual(model);
    expect(
      (await request(restarted).get(`/api/models/${model.id}/file`).expect(200))
        .text,
    ).toBe(fixture.ifc.toString());
  });

  it("persists indexes and hides files without deleting originals", async () => {
    const model = await firstModel();
    await request(app)
      .put(`/api/models/${model.id}/index`)
      .send(emptyIndex(model))
      .expect(200);
    expect((await firstModel()).index).toEqual(emptyIndex(model));
    await request(app).delete(`/api/models/${model.id}`).expect(204);
    const restarted = await createApp(fixture);
    await request(restarted).get("/api/models").expect(200, []);
    expect(await readFile(fixture.sourcePath)).toEqual(fixture.ifc);
  });

  it.each([
    "not-a-model-id",
    "..%2F..%2Fsecret",
    "00000000-0000-4000-8000-000000000000",
  ])("rejects invalid or unknown file IDs: %s", async (id) => {
    const response = await request(app).get(`/api/models/${id}/file`);
    expect([400, 404]).toContain(response.status);
    expect(response.body).toMatchObject({
      error: { code: expect.any(String), message: expect.any(String) },
    });
  });

  it("does not accept request-supplied source paths", async () => {
    await request(app).get("/api/models?path=C%3A%2FWindows").expect(400);
  });

  it.each([
    "example.com",
    "127.0.0.1.evil.example",
    "localhost:bad",
    "127.0.0.1:123:456",
  ])("rejects invalid Host headers: %s", async (host) => {
    await request(app).get("/api/health").set("Host", host).expect(403);
  });

  it("rejects cross-origin mutation before changing visibility", async () => {
    const model = await firstModel();
    await request(app)
      .delete(`/api/models/${model.id}`)
      .set("Origin", "https://evil.example")
      .expect(403);
    expect((await firstModel()).id).toBe(model.id);
  });

  it("accepts same-origin mutations through the Vite proxy host", async () => {
    const model = await firstModel();
    await request(app)
      .delete(`/api/models/${model.id}`)
      .set("Host", "127.0.0.1:5173")
      .set("Origin", "http://127.0.0.1:5173")
      .expect(204);
  });

  it("allows a browser upload through the real configured Vite proxy", async () => {
    const api = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => api.once("listening", resolve));
    const apiAddress = api.address();
    if (!apiAddress || typeof apiAddress === "string")
      throw new Error("Expected API listening address");
    const target = `http://127.0.0.1:${apiAddress.port}`;
    const configuredProxy = viteConfig.server?.proxy?.["/api"];
    if (!configuredProxy) throw new Error("Expected configured API proxy");
    const vite = await createServer({
      ...viteConfig,
      configFile: false,
      logLevel: "silent",
      server: {
        ...viteConfig.server,
        port: 0,
        strictPort: false,
        proxy: {
          "/api":
            typeof configuredProxy === "string"
              ? target
              : { ...configuredProxy, target },
        },
      },
    });
    try {
      await vite.listen();
      const address = vite.httpServer?.address();
      if (!address || typeof address === "string")
        throw new Error("Expected Vite listening address");
      const origin = `http://127.0.0.1:${address.port}`;
      const form = new FormData();
      form.append(
        "file",
        new Blob([fixture.ifc.toString()]),
        "proxy-upload.ifc",
      );
      const response = await fetch(`${origin}/api/models`, {
        method: "POST",
        headers: { Origin: origin },
        body: form,
      });
      expect(response.status).toBe(201);
      const model = LibraryModelSchema.parse(await response.json());
      expect(model.name).toBe("proxy-upload.ifc");
    } finally {
      await vite.close();
      await new Promise<void>((resolve, reject) =>
        api.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it.each([
    "garbage",
    "ISO-10303-21; HEADER; FILE_SCHEMA(('IFC4'));",
    "ISO-10303-21; HEADER; FILE_SCHEMA(('NOT_IFC')); ENDSEC; DATA; ENDSEC; END-ISO-10303-21;",
  ])("rejects incomplete or non-IFC headers", async (content) => {
    await request(app)
      .post("/api/models")
      .attach("file", Buffer.from(content), "bad.ifc")
      .expect(400);
    expect(await readdir(join(fixture.dataRoot, "uploads"))).toEqual([]);
  });

  it("rejects wrong multipart fields and missing uploads", async () => {
    await request(app)
      .post("/api/models")
      .attach("wrong", fixture.ifc, "model.ifc")
      .expect(400);
    await request(app).post("/api/models").expect(400);
  });

  it("bounds upload size and removes rejected partial files", async () => {
    const bounded = await createApp({ ...fixture, maxUploadBytes: 32 });
    await request(bounded)
      .post("/api/models")
      .attach("file", fixture.ifc, "large.ifc")
      .expect(413);
    expect(await readdir(join(fixture.dataRoot, "uploads"))).toEqual([]);
    expect(await readdir(join(fixture.dataRoot, "staging"))).toEqual([]);
  });

  it("rejects malformed and mismatched index boundaries", async () => {
    const model = await firstModel();
    await request(app)
      .put(`/api/models/${model.id}/index`)
      .send({ schemaVersion: 2 })
      .expect(400);
    await request(app)
      .put(`/api/models/${model.id}/index`)
      .send({ ...emptyIndex(model), fingerprint: "old" })
      .expect(409);
    await request(app)
      .put(`/api/models/${model.id}/index`)
      .send({
        ...emptyIndex(model),
        modelId: "00000000-0000-4000-8000-000000000000",
      })
      .expect(400);
  });
});
