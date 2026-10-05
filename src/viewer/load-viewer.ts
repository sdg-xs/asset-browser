import type { ComponentType } from "react";
import { z } from "zod";
import type { PreviewGeometry } from "../../shared/contracts.js";

const ViewerModuleSchema = z.object({
  AssetViewer: z.custom<ComponentType<{ geometry: PreviewGeometry }>>(
    (value) => typeof value === "function",
    "The downloaded module does not export an asset viewer.",
  ),
});
const ManifestSchema = z.object({
  "src/viewer/AssetViewer.tsx": z.object({
    file: z.string().regex(/^assets\/[A-Za-z0-9_.-]+\.js$/),
  }),
});

export async function loadAssetViewer(
  attempt = 0,
): Promise<{ default: z.infer<typeof ViewerModuleSchema>["AssetViewer"] }> {
  if (attempt === 0) {
    return { default: (await import("./AssetViewer.js")).AssetViewer };
  }

  let path = "/src/viewer/AssetViewer.tsx";
  if (import.meta.env.PROD) {
    const response = await fetch("/asset-manifest.json", { cache: "no-store" });
    if (!response.ok)
      throw new Error(
        "The local service could not provide the viewer download address.",
      );
    const raw: unknown = await response.json();
    path = `/${ManifestSchema.parse(raw)["src/viewer/AssetViewer.tsx"].file}`;
  }
  const url = new URL(path, window.location.origin);
  // A new URL bypasses the browser's cached failed dynamic import.
  url.searchParams.set("viewerRetry", `${Date.now()}-${attempt}`);
  const module: unknown = await import(/* @vite-ignore */ url.href);
  return { default: ViewerModuleSchema.parse(module).AssetViewer };
}
