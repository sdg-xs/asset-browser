import { afterEach, describe, expect, it, vi } from "vitest";
import { importGeometry } from "../src/viewer/import-geometry.js";
import { encodeGeometry, geometryUploadSchema } from "../shared/mesh-geometry.js";

afterEach(() => vi.unstubAllGlobals());
function gltf(uri: string) {
  return { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, translation: [2, 3, 4] }],
    buffers: [{ byteLength: 36, uri }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 0.5], baseColorTexture: { index: 0 } }, alphaMode: "BLEND" }],
    textures: [{ source: 0 }], images: [{ uri: "not-required.png" }],
  };
}
const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
function allowProgressEvents() {
  vi.stubGlobal("ProgressEvent", class { constructor(public type: string, public options: unknown) {} });
}
describe("model geometry imports", () => {
  it("loads glTF with a companion buffer, preserves transforms and colors, and omits textures", async () => {
    allowProgressEvents();
    const result = await importGeometry([
      new File([JSON.stringify(gltf("mesh.bin"))], "asset.gltf"), new File([vertices], "mesh.bin"),
    ]);
    expect(result.format).toBe("gltf");
    expect(result.geometry.meshes[0]?.color).toEqual([1, 0, 0, 0.5]);
    expect(result.geometry.meshes[0]?.transform.slice(12, 15)).toEqual([2, 3, 4]);
    expect(result.geometry.meshes[0]?.positions).toEqual(vertices);
    expect(result.geometry.meshes[0]?.indices).toEqual(new Uint32Array([0, 1, 2]));
    expect(geometryUploadSchema.safeParse({ name: result.name, format: result.format, geometry: encodeGeometry(result.geometry) }).success).toBe(true);
  });
  it("loads binary GLB using the same colored preview mesh representation", async () => {
    const document = gltf("");
    const { uri, ...buffer } = document.buffers[0] ?? { byteLength: 36, uri: "" };
    const json = new TextEncoder().encode(JSON.stringify({ ...document, buffers: [buffer] }));
    const size = Math.ceil(json.length / 4) * 4;
    const binary = new ArrayBuffer(12 + 8 + size + 8 + vertices.byteLength);
    const view = new DataView(binary);
    view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, binary.byteLength, true);
    view.setUint32(12, size, true); view.setUint32(16, 0x4e4f534a, true);
    const bytes = new Uint8Array(binary);
    bytes.fill(32, 20, 20 + size); bytes.set(json, 20);
    view.setUint32(20 + size, vertices.byteLength, true); view.setUint32(24 + size, 0x004e4942, true);
    bytes.set(new Uint8Array(vertices.buffer), 28 + size);
    const result = await importGeometry([new File([binary], "asset.glb")]);
    expect(result.geometry.meshes[0]?.color).toEqual([1, 0, 0, 0.5]);
    expect(result.geometry.meshes[0]?.positions).toEqual(vertices);
  });
  it("reports missing glTF buffers without fetching external model dependencies", async () => {
    await expect(importGeometry([new File([JSON.stringify(gltf("missing.bin"))], "asset.gltf")])).rejects.toThrow("Missing companion file: missing.bin");
  });
  it("keeps separate OBJ material colors and transparency from companion MTL", async () => {
    const obj = "mtllib asset.mtl\nv 0 0 0\nv 1 0 0\nv 0 1 0\nusemtl red\nf 1 2 3\nusemtl blue\nf 1 3 2\n";
    const mtl = "newmtl red\nKd 1 0 0\nd 0.5\nmap_Kd missing.png\nnewmtl blue\nKd 0 0 1\n";
    const result = await importGeometry([new File([obj], "asset.obj"), new File([mtl], "asset.mtl")]);
    expect(result.geometry.meshes).toHaveLength(2);
    expect(result.geometry.meshes.map(mesh => mesh.color)).toEqual([[1, 0, 0, 0.5], [0, 0, 1, 1]]);
    expect(result.geometry.meshes.map(mesh => mesh.indices.length)).toEqual([3, 3]);
  });
  it("loads STL into the existing triangle preview with a default material", async () => {
    const stl = "solid triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid triangle";
    const result = await importGeometry([new File([stl], "asset.stl")]);
    expect(result.geometry.meshes[0]?.positions).toEqual(vertices);
    expect(result.geometry.meshes[0]?.color[3]).toBe(1);
  });
  it("rejects empty geometry and multiple main model files", async () => {
    await expect(importGeometry([new File(["# empty"], "empty.obj")])).rejects.toThrow("no triangle geometry");
    await expect(importGeometry([new File([""], "one.obj"), new File([""], "two.stl")])).rejects.toThrow("Choose one 3D model");
  });
});
