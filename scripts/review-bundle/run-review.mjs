import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw Error("This review bundle needs Node.js 24 or newer.");
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const dataRoot = join(root, "review-data");
const sourceRoot = join(root, "review-sources");
await mkdir(sourceRoot, { recursive: true });
const libraryPath = join(dataRoot, "library.json");
const catalogPath = join(dataRoot, "catalog-library.json");
const library = JSON.parse(await readFile(libraryPath, "utf8"));
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const manifest = JSON.parse(await readFile(join(root, "review-bundle.json"), "utf8"));
const fingerprints = new Map();
let relocated = false;
for (const entry of library.entries) {
  const path = join(dataRoot, "uploads", `${entry.model.id}.ifc`);
  if (entry.path === path) continue;
  const original = manifest.models.find(model => model.id === entry.model.id);
  if (original) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    if (hash.digest("hex") !== original.sha256)
      throw Error(`${entry.model.name} differs from the bundled model. Restore it from the ZIP before relocating this review folder.`);
    const info = await stat(path);
    const fingerprint = `${info.size}:${info.mtimeMs}`;
    const existing = fingerprints.get(entry.model.fingerprint);
    if (existing && existing !== fingerprint) throw Error("Ambiguous model fingerprints in this review bundle.");
    fingerprints.set(entry.model.fingerprint, fingerprint);
    entry.model.modifiedAt = info.mtime.toISOString();
    entry.model.size = info.size;
  } else {
    await stat(path);
  }
  entry.path = path;
  entry.model.source = "upload";
  relocated = true;
}
function rebind(value) {
  if (!value || typeof value !== "object") return;
  if (typeof value.fingerprint === "string" && fingerprints.has(value.fingerprint))
    value.fingerprint = fingerprints.get(value.fingerprint);
  for (const child of Object.values(value)) rebind(child);
}
if (relocated) {
  rebind(library);
  rebind(catalog);
  await writeFile(libraryPath, JSON.stringify(library, null, 2));
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2));
  process.stdout.write("Prepared the populated library and geometry for this folder.\n");
}
process.env.IFC_DATA_ROOT = dataRoot;
process.env.IFC_SOURCE_ROOT = sourceRoot;
if (!process.env.PORT) {
  for (let port = 3001; port <= 3010; port++) {
    const available = await new Promise(resolvePort => {
      const probe = createServer();
      probe.once("error", () => resolvePort(false));
      probe.listen(port, "127.0.0.1", () => probe.close(() => resolvePort(true)));
    });
    if (available) { process.env.PORT = String(port); break; }
  }
  if (!process.env.PORT) throw Error("Ports 3001–3010 are busy. Set PORT to an available port and run again.");
}
process.stdout.write(`Open http://127.0.0.1:${process.env.PORT} to review the populated library.\n`);
if (process.argv.includes("--dev")) {
  const { spawn } = await import("node:child_process");
  const child = spawn(process.execPath, [join(root, "node_modules/concurrently/dist/bin/concurrently.js"), "-k", "tsx watch server/index.ts", "vite --host 127.0.0.1"], { stdio: "inherit", env: process.env });
  child.once("exit", code => { process.exitCode = code ?? 1; });
} else {
  await import(new URL("../dist-server/server/index.js", import.meta.url));
}
