import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readConfig } from "../dist-server/server/config.js";
import { reviewModelPath } from "./review-model-path.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const staging = join(root, "output", `review-package-${stamp}`);
const bundle = join(staging, "HEMY-Asset-Library-Review");
const zip = join(root, "output", `HEMY-Asset-Library-Review-${stamp}.zip`);
const dataRoot = resolve(process.env.IFC_DATA_ROOT || join(root, ".local-data"));
const { sourceRoot } = readConfig();
const catalog = JSON.parse(await readFile(join(dataRoot, "catalog-library.json"), "utf8"));
const library = JSON.parse(await readFile(join(dataRoot, "library.json"), "utf8"));
await stat(join(root, "dist/index.html"));
await stat(join(root, "dist-server/server/index.js"));
await mkdir(bundle, { recursive: true });
for (const directory of ["src", "shared", "server", "tests", "public", "dist", "dist-server"])
  await cp(join(root, directory), join(bundle, directory), { recursive: true });
for (const file of ["index.html", "package-lock.json", "tsconfig.json", "tsconfig.server.json", "vite.config.ts", "vitest.config.ts"])
  await copyFile(join(root, file), join(bundle, file));
await mkdir(join(bundle, "scripts"));
await copyFile(join(root, "scripts/copy-wasm.mjs"), join(bundle, "scripts/copy-wasm.mjs"));
await copyFile(join(root, "scripts/review-model-path.mjs"), join(bundle, "scripts/review-model-path.mjs"));
await copyFile(join(root, "scripts/review-bundle/run-review.mjs"), join(bundle, "scripts/run-review.mjs"));
for (const file of ["README.md", "AGENTS.md"])
  await copyFile(join(root, "scripts/review-bundle", file), join(bundle, file));
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
packageJson.scripts.start = "node scripts/run-review.mjs";
packageJson.scripts.dev = "node scripts/run-review.mjs --dev";
await writeFile(join(bundle, "package.json"), JSON.stringify(packageJson, null, 2));
await writeFile(join(bundle, ".gitignore"), "node_modules/\nreview-data/\nreview-sources/\n*.log\n");

const modelIds = new Set(catalog.sources.map(source => source.modelId));
for (const entry of catalog.entries)
  if (entry.geometryReference && entry.geometryReference.kind !== "mesh") modelIds.add(entry.geometryReference.modelId);
const portable = { schemaVersion: 1, entries: library.entries.filter(entry => modelIds.has(entry.model.id)) };
const missing = [...modelIds].filter(id => !portable.entries.some(entry => entry.model.id === id));
if (missing.length) throw Error(`Missing referenced models: ${missing.join(", ")}`);
const reviewData = join(bundle, "review-data");
await mkdir(join(reviewData, "uploads"), { recursive: true });
const models = [];
for (const entry of portable.entries) {
  const file = `uploads/${entry.model.id}.ifc`;
  const destination = join(reviewData, file);
  await copyFile(reviewModelPath(entry, { sourceRoot, dataRoot }), destination);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(destination)) hash.update(chunk);
  const info = await stat(destination);
  models.push({ id: entry.model.id, name: entry.model.name, file, bytes: info.size, sha256: hash.digest("hex") });
  entry.path = file;
  entry.model.source = "upload";
}
const meshIds = new Set(catalog.entries.flatMap(entry => entry.geometryReference?.kind === "mesh" ? [entry.geometryReference.geometryId] : []));
if (meshIds.size) await mkdir(join(reviewData, "geometry"));
for (const id of meshIds) await copyFile(join(dataRoot, "geometry", `${id}.json`), join(reviewData, "geometry", `${id}.json`));
await writeFile(join(reviewData, "library.json"), JSON.stringify(portable, null, 2));
await writeFile(join(reviewData, "catalog-library.json"), JSON.stringify(catalog, null, 2));
const counts = {
  entries: catalog.entries.length,
  approvedEntries: catalog.entries.filter(entry => entry.status === "approved").length,
  approvedTypeNames: new Set(catalog.entries.filter(entry => entry.status === "approved").map(entry => entry.definition.name.trim().toLocaleLowerCase())).size,
  draftEntries: catalog.entries.filter(entry => entry.status === "draft").length,
  categories: catalog.categories.length,
};
await writeFile(join(bundle, "review-bundle.json"), JSON.stringify({ packagedAt: new Date().toISOString(), catalogRevision: catalog.revision, counts, models, meshRecords: meshIds.size }, null, 2));
const current = JSON.parse(await readFile(join(dataRoot, "catalog-library.json"), "utf8"));
if (current.revision !== catalog.revision) throw Error("The catalog changed during packaging. Run the packaging command again to capture a consistent snapshot.");
if (process.platform !== "win32") throw Error(`Bundle prepared at ${bundle}. ZIP creation in this script requires Windows PowerShell.`);
const quote = value => `'${value.replaceAll("'", "''")}'`;
const archived = spawnSync("powershell.exe", ["-NoProfile", "-Command", `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory(${quote(staging)}, ${quote(zip)}, [System.IO.Compression.CompressionLevel]::Optimal, $false)`], { encoding: "utf8", windowsHide: true });
if (archived.status !== 0) throw Error(archived.stderr || "ZIP creation failed.");
process.stdout.write(`${JSON.stringify({ zip, bundle, bytes: (await stat(zip)).size, counts, models: models.length }, null, 2)}\n`);
