export function reviewModelPath(
  entry: { path: string; model: { source: "existing" | "upload" } },
  roots: { sourceRoot: string; dataRoot: string },
): string;
