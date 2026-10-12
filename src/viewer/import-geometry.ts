import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader, type MaterialInfo } from "three/addons/loaders/MTLLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import type { MeshFormat } from "../../shared/mesh-geometry.js";
import type { PreviewGeometry } from "../../shared/contracts.js";
import { meshFormat } from "./geometry-files.js";

export type ImportedGeometry = { name: string; format: MeshFormat; geometry: PreviewGeometry };
// The preview stores flat colors, so texture images are unnecessary upload dependencies.
function withoutTextures(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutTextures);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "images" && key !== "textures" && !key.endsWith("Texture"))
    .map(([key, child]) => [key, withoutTextures(child)]));
  return value;
}
function colorOnlyGltf(data: ArrayBuffer, binary: boolean): ArrayBuffer | string {
  const decoder = new TextDecoder();
  if (!binary) return JSON.stringify(withoutTextures(JSON.parse(decoder.decode(data))));
  const source = new DataView(data);
  if (data.byteLength < 20 || source.getUint32(0, true) !== 0x46546c67 || source.getUint32(4, true) !== 2 ||
      source.getUint32(8, true) !== data.byteLength || source.getUint32(16, true) !== 0x4e4f534a)
    throw Error("Choose a valid GLB 2.0 file.");
  const length = source.getUint32(12, true);
  if (20 + length > data.byteLength) throw Error("The GLB file is incomplete.");
  const json = new TextEncoder().encode(JSON.stringify(withoutTextures(JSON.parse(decoder.decode(data.slice(20, 20 + length))))));
  const padded = Math.ceil(json.length / 4) * 4;
  const tail = new Uint8Array(data.slice(20 + length));
  const output = new ArrayBuffer(20 + padded + tail.length);
  const header = new DataView(output);
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, output.byteLength, true);
  header.setUint32(12, padded, true); header.setUint32(16, 0x4e4f534a, true);
  const bytes = new Uint8Array(output);
  bytes.fill(32, 20, 20 + padded); bytes.set(json, 20); bytes.set(tail, 20 + padded);
  return output;
}
export function sceneGeometry(root: THREE.Object3D): PreviewGeometry {
  const meshes: PreviewGeometry["meshes"] = [];
  root.updateMatrixWorld(true);
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh) || !(node.geometry instanceof THREE.BufferGeometry)) return;
    const buffer = node.geometry;
    const position = buffer.getAttribute("position");
    if (!position || !position.count) return;
    if (!buffer.getAttribute("normal")) buffer.computeVertexNormals();
    const normal = buffer.getAttribute("normal");
    const positions = new Float32Array(position.count * 3);
    const normals = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      positions.set([position.getX(i), position.getY(i), position.getZ(i)], i * 3);
      normals.set([normal.getX(i), normal.getY(i), normal.getZ(i)], i * 3);
    }
    const count = buffer.index?.count ?? position.count;
    const groups = buffer.groups.length ? buffer.groups : [{ start: 0, count, materialIndex: 0 }];
    for (const group of groups) {
      const end = Math.min(group.start + group.count, count);
      if (end - group.start < 3) continue;
      const indices = new Uint32Array(end - group.start);
      for (let i = group.start; i < end; i++) indices[i - group.start] = buffer.index?.getX(i) ?? i;
      const material = Array.isArray(node.material) ? node.material[group.materialIndex ?? 0] : node.material;
      const color = material instanceof THREE.Material && "color" in material && material.color instanceof THREE.Color
        ? material.color : new THREE.Color(0.7, 0.7, 0.7);
      meshes.push({ positions, normals, indices, transform: node.matrixWorld.toArray(),
        color: [color.r, color.g, color.b, material instanceof THREE.Material ? material.opacity : 1] });
    }
  });
  if (!meshes.length) throw Error("The model has no triangle geometry to preview.");
  return { meshes };
}
function disposeScene(root: THREE.Object3D) {
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.geometry instanceof THREE.BufferGeometry) node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) if (material instanceof THREE.Material) material.dispose();
  });
}
export async function importGeometry(files: File[]): Promise<ImportedGeometry> {
  const mainFiles = files.filter(file => meshFormat(file.name) || /\.ifc$/i.test(file.name));
  const main = mainFiles[0];
  if (!main || mainFiles.length !== 1) throw Error("Choose one 3D model, along with any .bin or .mtl companion files.");
  const format = meshFormat(main.name);
  if (!format) throw Error("Use the IFC upload workflow for IFC files.");
  let root: THREE.Object3D | undefined;
  const urls = new Map<string, string>();
  try {
    if (format === "obj") {
      root = new OBJLoader().parse(await main.text());
      const libraries = files.filter(file => /\.mtl$/i.test(file.name));
      const definitions: Record<string, MaterialInfo> = {};
      for (const file of libraries) Object.assign(definitions, new MTLLoader().parse(await file.text(), "").materialsInfo);
      root.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
          if (!(material instanceof THREE.Material)) continue;
          const info = definitions[material.name];
          if (!info) continue;
          if (info.kd && "color" in material && material.color instanceof THREE.Color)
            material.color.setRGB(info.kd[0] ?? 0.7, info.kd[1] ?? 0.7, info.kd[2] ?? 0.7, THREE.SRGBColorSpace);
          material.opacity = Number(info.d ?? (info.tr === undefined ? 1 : 1 - Number(info.tr)));
          material.transparent = material.opacity < 1;
        }
      });
    } else if (format === "stl") {
      root = new THREE.Mesh(new STLLoader().parse(await main.arrayBuffer()), new THREE.MeshStandardMaterial({ color: 0xb3b3b3 }));
    } else {
      for (const file of files) {
        const name = file.name.toLowerCase();
        if (urls.has(name)) throw Error(`Two uploaded files have the name ${file.name}. Choose one copy.`);
        urls.set(name, URL.createObjectURL(file));
      }
      const manager = new THREE.LoadingManager();
      manager.setURLModifier(url => {
        if (url.startsWith("data:") || url.startsWith("blob:")) return url;
        const name = decodeURIComponent(url.split("/").pop() ?? "").toLowerCase();
        const resource = urls.get(name);
        if (!resource) throw Error(`Missing companion file: ${name}. Select it together with the model.`);
        return resource;
      });
      root = (await new GLTFLoader(manager).parseAsync(colorOnlyGltf(await main.arrayBuffer(), format === "glb"), "")).scene;
    }
    return { name: main.name, format, geometry: sceneGeometry(root) };
  } finally {
    for (const url of urls.values()) URL.revokeObjectURL(url);
    if (root) disposeScene(root);
  }
}
