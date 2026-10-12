import { join, resolve } from "node:path";

export function reviewModelPath(entry, roots) {
  const root = entry.model.source === "existing"
    ? roots.sourceRoot
    : join(roots.dataRoot, "uploads");
  return resolve(root, entry.path);
}
