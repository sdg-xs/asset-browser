import { useEffect, useRef, useState } from "react";
import type { CreationIndex } from "../../shared/asset-creation.js";
import type { AssetUploadDetails, LibrarySnapshot } from "../../shared/catalog-library.js";
import type { IfcWorkerClient } from "../ifc/client.js";
import type { LibraryApi } from "../library/api.js";
import type { CatalogAction } from "./api.js";
import { creationTypeRows } from "./creation-groups.js";
import { previewCandidate } from "./useDefinitionPreview.js";
import type { Inspection } from "../library/useLibrary.js";

export type CreationWorker = Pick<
  IfcWorkerClient,
  "openModel" | "discoverAssets" | "analyzeAssets" | "readGeometry" | "dispose"
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
  const [inspection, setInspection] = useState<Inspection>({ kind: "closed" });
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const generation = useRef(0);
  const alive = useRef(true);
  const worker = useRef<CreationWorker | null>(null);
  const inFlight = useRef(false);
  const candidateKey = stage.kind === "selection" ? [...stage.selected][0] : undefined;
  const selectionIndex = stage.kind === "selection" ? stage.index : null;
  useEffect(() => {
    const candidate = selectionIndex?.candidates.find(candidate => candidate.key === candidateKey);
    const asset = selectionIndex && previewCandidate(candidate, selectionIndex.modelId);
    const client = worker.current;
    if (!candidate || !asset || !client) { setInspection({ kind: "closed" }); return; }
    let active = true;
    setInspection({ kind: "loading", asset });
    void client.readGeometry({ modelId: asset.modelId, elementId: candidate.representativeId }).then(geometry => {
      if (!active) return;
      if (!geometry.meshes.length) throw Error("This type has no preview geometry. Choose another type or IFC file.");
      setInspection({ kind: "ready", asset, geometry, properties: [], elementId: candidate.representativeId, notice: "" });
    }).catch(cause => {
      if (active) setInspection({ kind: "failed", asset, message: cause instanceof Error ? cause.message : "Could not preview this asset." });
    });
    return () => { active = false; };
  }, [candidateKey, selectionIndex, previewAttempt]);
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
    let keepOpen = false;
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
      const rows = creationTypeRows(index, snapshot);
      keepOpen = true;
      setStage({
        kind: "selection",
        fileName: file.name,
        index,
        snapshot,
        revision,
        selected: new Set(rows.length === 1 && rows[0] ? [rows[0].key] : []),
      });
    } catch (cause) {
      if (valid()) setStage({ kind: "failed", message: `${cause instanceof Error ? cause.message : "Could not analyze this IFC."} Choose the current source file and analyze it again.` });
    } finally {
      if (!keepOpen) client?.dispose();
      if (valid()) {
        if (!keepOpen) worker.current = null;
        inFlight.current = false;
      }
    }
  };
  const toggle = (keys: string[]) => setStage(previous => {
    if (previous.kind !== "selection") return previous;
    const selected = new Set(keys[0] ? [keys[0]] : []);
    return { ...previous, selected };
  });
  const clearSelection = () => setStage(previous => previous.kind === "selection" ? { ...previous, selected: new Set() } : previous);
  const importSelected = async (details: AssetUploadDetails) => {
    if (stage.kind !== "selection" || stage.selected.size !== 1 || inFlight.current) return;
    if (stage.revision !== revision) {
      setStage({ kind: "failed", message: "The catalog changed while you selected the asset. Analyze the IFC again to review a fresh selection." });
      return;
    }
    const key = [...stage.selected][0];
    if (!key || inspection.kind !== "ready" || inspection.asset.id !== key) return;
    inFlight.current = true;
    const current = generation.current;
    const valid = () => alive.current && generation.current === current;
    const count = creationTypeRows(stage.index, stage.snapshot)
      .filter(row => row.candidateKeys.some(key => stage.selected.has(key))).length;
    setStage({ kind: "importing", fileName: stage.fileName, count });
    try {
      const saved = await execute({
        kind: "import-asset",
        snapshot: stage.snapshot,
        candidateKey: key,
        details,
      });
      if (!valid()) return;
      if (!saved) {
        setStage({ kind: "failed", message: "The asset could not be saved. Check the catalog message, then analyze the IFC again to review a fresh selection." });
        return;
      }
      setStage({ kind: "complete", count });
      onSuccess();
    } catch (cause) {
      if (valid()) setStage({ kind: "failed", message: `${cause instanceof Error ? cause.message : "Asset creation failed."} Analyze the IFC again to review a fresh selection.` });
    } finally {
      if (valid()) inFlight.current = false;
    }
  };
  const retry = () => {
    invalidate();
    setStage({ kind: "file" });
  };
  return { stage, inspection, analyze, toggle, clearSelection, importSelected, retryPreview: () => setPreviewAttempt(value => value + 1), retry, cancel: invalidate };
}
