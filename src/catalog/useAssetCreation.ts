import { useEffect, useRef, useState } from "react";
import type { CreationIndex } from "../../shared/asset-creation.js";
import type { LibrarySnapshot } from "../../shared/catalog-library.js";
import type { IfcWorkerClient } from "../ifc/client.js";
import type { LibraryApi } from "../library/api.js";
import type { CatalogAction } from "./api.js";

export type CreationWorker = Pick<
  IfcWorkerClient,
  "openModel" | "discoverAssets" | "analyzeAssets" | "dispose"
>;
export type CreationStage =
  | { kind: "file" }
  | { kind: "uploading"; fileName: string; percent: number }
  | { kind: "analyzing"; fileName: string; message: string }
  | {
      kind: "selection";
      fileName: string;
      index: CreationIndex;
      snapshot: LibrarySnapshot;
      selected: ReadonlySet<string>;
      revision: number;
    }
  | { kind: "importing"; fileName: string; count: number }
  | { kind: "failed"; message: string }
  | { kind: "complete"; count: number };

export interface AssetCreationOptions {
  sourceApi: LibraryApi;
  revision: number;
  execute(action: CatalogAction): Promise<boolean>;
  createWorker(): CreationWorker;
  onSuccess(): void;
}

export function useAssetCreation({
  sourceApi,
  revision,
  execute,
  createWorker,
  onSuccess,
}: AssetCreationOptions) {
  const [stage, setStage] = useState<CreationStage>({ kind: "file" });
  const generation = useRef(0);
  const alive = useRef(true);
  const worker = useRef<CreationWorker | null>(null);
  const inFlight = useRef(false);
  const invalidate = () => {
    generation.current++;
    worker.current?.dispose();
    worker.current = null;
    inFlight.current = false;
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      worker.current?.dispose();
      worker.current = null;
    };
  }, []);
  const analyze = async (file: File) => {
    if (inFlight.current) return;
    invalidate();
    if (!/\.ifc$/i.test(file.name) || file.size === 0) {
      setStage({ kind: "failed", message: "Choose a nonempty .ifc file, then try again." });
      return;
    }
    inFlight.current = true;
    const current = generation.current;
    const valid = () => alive.current && generation.current === current;
    const onProgress = (message: string) => {
      if (valid()) setStage({ kind: "analyzing", fileName: file.name, message });
    };
    let client: CreationWorker | null = null;
    setStage({ kind: "uploading", fileName: file.name, percent: 0 });
    try {
      const model = await sourceApi.upload(file, percent => {
        if (valid()) setStage({ kind: "uploading", fileName: file.name, percent });
      });
      if (!valid()) return;
      client = createWorker();
      worker.current = client;
      onProgress("Opening IFC for asset discovery…");
      await client.openModel({
        model,
        fileUrl: `/api/models/${model.id}/file`,
        purpose: "creation",
        onProgress,
      });
      if (!valid()) return;
      const index = await client.discoverAssets({ modelId: model.id, onProgress });
      if (!valid()) return;
      await sourceApi.saveCreationIndex(index);
      if (!valid()) return;
      onProgress("Reading asset properties…");
      const snapshot = await client.analyzeAssets({ modelId: model.id, onProgress });
      if (!valid()) return;
      setStage({
        kind: "selection",
        fileName: file.name,
        index,
        snapshot,
        revision,
        selected: new Set(index.candidates
          .filter(c => c.categories.length > 0 && c.classificationIssues.length === 0)
          .map(c => c.key)),
      });
    } catch (cause) {
      if (valid()) setStage({ kind: "failed", message: `${cause instanceof Error ? cause.message : "Could not analyze this IFC."} Choose the current source file and analyze it again.` });
    } finally {
      client?.dispose();
      if (valid()) {
        worker.current = null;
        inFlight.current = false;
      }
    }
  };
  const toggle = (key: string) => setStage(previous => {
    if (previous.kind !== "selection") return previous;
    const selected = new Set(previous.selected);
    if (selected.has(key)) selected.delete(key);
    else selected.add(key);
    return { ...previous, selected };
  });
  const clearSelection = () => setStage(previous => previous.kind === "selection" ? { ...previous, selected: new Set() } : previous);
  const importSelected = async () => {
    if (stage.kind !== "selection" || !stage.selected.size || inFlight.current) return;
    if (stage.revision !== revision) {
      setStage({ kind: "failed", message: "The catalog changed while you selected assets. Analyze the IFC again to review a fresh selection." });
      return;
    }
    inFlight.current = true;
    const current = generation.current;
    const valid = () => alive.current && generation.current === current;
    const count = stage.selected.size;
    setStage({ kind: "importing", fileName: stage.fileName, count });
    try {
      const saved = await execute({
        kind: "import-selected",
        snapshot: stage.snapshot,
        candidateKeys: [...stage.selected],
      });
      if (!valid()) return;
      if (!saved) {
        setStage({ kind: "failed", message: "The drafts could not be saved. Check the catalog message, then analyze the IFC again to review a fresh selection." });
        return;
      }
      setStage({ kind: "complete", count });
      onSuccess();
    } catch (cause) {
      if (valid()) setStage({ kind: "failed", message: `${cause instanceof Error ? cause.message : "Draft creation failed."} Analyze the IFC again to review a fresh selection.` });
    } finally {
      if (valid()) inFlight.current = false;
    }
  };
  const retry = () => {
    invalidate();
    setStage({ kind: "file" });
  };
  return { stage, analyze, toggle, clearSelection, importSelected, retry, cancel: invalidate };
}
