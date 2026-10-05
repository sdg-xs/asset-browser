import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import type { CatalogIndex, LibraryModel } from "../shared/contracts.js";

export async function libraryFixture() {
  const root = await mkdtemp(join(tmpdir(), "hemy-library-test-"));
  const sourceRoot = join(root, "sources");
  const dataRoot = join(root, "managed");
  const sourcePath = join(sourceRoot, "BS19", "IFC", "BS19.ifc");
  const ifc = await readFile(
    new URL("./fixtures/minimal.ifc", import.meta.url),
  );
  await mkdir(join(sourceRoot, "BS19", "IFC"), { recursive: true });
  await writeFile(sourcePath, ifc);
  return {
    sourceRoot,
    dataRoot,
    sourcePath,
    ifc,
    async cleanup() {
      const absoluteRoot = resolve(root);
      if (
        !absoluteRoot.startsWith(`${resolve(tmpdir())}${sep}hemy-library-test-`)
      ) {
        throw new Error(
          "Test cleanup target is outside the temporary fixture directory",
        );
      }
      await rm(absoluteRoot, { recursive: true, force: true });
    },
  };
}

export function emptyIndex(model: LibraryModel): CatalogIndex {
  return {
    schemaVersion: 1,
    modelId: model.id,
    fingerprint: model.fingerprint,
    types: [],
    stats: { elements: 0, classified: 0, excluded: 0, untyped: 0 },
  };
}
