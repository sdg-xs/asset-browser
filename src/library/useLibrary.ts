import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AssetType,
  CatalogIndex,
  LibraryModel,
  PreviewGeometry,
  PropertyGroup,
} from "../../shared/contracts.js";
import { IfcWorkerClient } from "../ifc/client.js";
import { libraryApi, type LibraryApi } from "./api.js";
import { SourceRevisionError } from "../../shared/revision.js";

export type LibraryWorker = Pick<
  IfcWorkerClient,
  "openModel" | "readProperties" | "readGeometry" | "dispose"
>;
export interface Dependencies {
  api: LibraryApi;
  createWorker(): LibraryWorker;
}
const defaults: Dependencies = {
  api: libraryApi,
  createWorker: () => new IfcWorkerClient(),
};
type Processing =
  | { kind: "idle" }
  | { kind: "busy"; message: string }
  | { kind: "ready" }
  | { kind: "failed"; message: string };
export type Inspection =
  | { kind: "closed" }
  | { kind: "loading"; asset: AssetType }
  | {
      kind: "ready";
      asset: AssetType;
      properties: PropertyGroup[];
      geometry: PreviewGeometry | null;
      notice: string;
      elementId: number;
    }
  | { kind: "failed"; asset: AssetType; message: string };
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The library could not complete this request.";

export function useLibrary(dependencies: Dependencies = defaults) {
  const [models, setModels] = useState<LibraryModel[]>([]);
  const [inventory, setInventory] = useState<Processing>({
    kind: "busy",
    message: "Finding local IFC models…",
  });
  const [modelId, setModelId] = useState("");
  const [processing, setProcessing] = useState<Processing>({ kind: "idle" });
  const [inspection, setInspection] = useState<Inspection>({ kind: "closed" });
  const [notice, setNotice] = useState("");
  const client = useRef<LibraryWorker | null>(null);
  const modelGeneration = useRef(0);
  const selectionGeneration = useRef(0);
  const inventoryGeneration = useRef(0);
  const openRequest = useRef<Promise<CatalogIndex> | null>(null);
  const work = useRef<Promise<unknown>>(Promise.resolve());
  const alive = useRef(true);
  const model = models.find((item) => item.id === modelId) ?? null;

  const invalidate = useCallback(() => {
    modelGeneration.current++;
    selectionGeneration.current++;
    client.current?.dispose();
    openRequest.current = null;
    work.current = Promise.resolve();
  }, []);
  const chooseModel = useCallback(
    (id: string) => {
      invalidate();
      setModelId(id);
      setInspection({ kind: "closed" });
      setProcessing({ kind: "idle" });
      setNotice("");
    },
    [invalidate],
  );
  const refresh = useCallback(async (preserveSelection = false) => {
    const current = ++inventoryGeneration.current;
    setInventory({ kind: "busy", message: "Finding local IFC models…" });
    try {
      const found = await dependencies.api.list();
      if (!alive.current || current !== inventoryGeneration.current) return;
      setModels((previous) => found.map((item) => {
        const known = previous.find((candidate) =>
          candidate.id === item.id && candidate.fingerprint === item.fingerprint,
        );
        return { ...item, index: item.index ?? known?.index ?? null };
      }));
      setInventory({ kind: "ready" });
      if (preserveSelection) return;
      chooseModel(
        (
          found.find((item) => item.name.toUpperCase() === "BS19.IFC") ??
          found[0]
        )?.id ?? "",
      );
    } catch (error) {
      if (alive.current && current === inventoryGeneration.current)
        setInventory({ kind: "failed", message: message(error) });
    }
  }, [dependencies, chooseModel]);
  useEffect(() => {
    alive.current = true;
    client.current = dependencies.createWorker();
    void refresh();
    return () => {
      alive.current = false;
      inventoryGeneration.current++;
      invalidate();
    };
  }, [dependencies, refresh, invalidate]);

  const open = useCallback(
    (source: LibraryModel) => {
      if (openRequest.current) return openRequest.current;
      const current = modelGeneration.current;
      setProcessing({ kind: "busy", message: "Opening IFC source…" });
      const worker = client.current;
      if (!worker)
        return Promise.reject(new Error("IFC worker is unavailable."));
      const valid = () => current === modelGeneration.current && alive.current;
      const load = async (
        candidate: LibraryModel,
        canRefresh: boolean,
      ): Promise<CatalogIndex> => {
        try {
          const result = await worker.openModel({
            model: candidate,
            fileUrl: `/api/models/${candidate.id}/file`,
            onProgress: (progress) => {
              if (valid()) setProcessing({ kind: "busy", message: progress });
            },
          });
          if (!valid()) return result;
          try {
            await dependencies.api.saveIndex(result);
          } catch (error) {
            if (error instanceof SourceRevisionError) throw error;
            if (valid()) setNotice(
              `Catalog is available for this session. Saving failed: ${message(error)}`,
            );
          }
          if (valid()) {
            setModels((previous) => previous.map((item) =>
              item.id === candidate.id ? { ...candidate, index: result } : item,
            ));
            setProcessing({ kind: "ready" });
          }
          return result;
        } catch (error) {
          if (!(error instanceof SourceRevisionError) || !valid()) throw error;
          worker.dispose();
          setModels((previous) => previous.map((item) =>
            item.id === candidate.id ? { ...item, index: null } : item,
          ));
          if (!canRefresh) throw error;
          setProcessing({ kind: "busy", message: "Source changed. Loading the current revision…" });
          const inventoryVersion = ++inventoryGeneration.current;
          const found = await dependencies.api.list();
          if (!valid() || inventoryVersion !== inventoryGeneration.current)
            throw new DOMException("IFC processing cancelled.", "AbortError");
          setModels(found);
          const refreshed = found.find((item) => item.id === candidate.id);
          if (!refreshed) throw new Error("This source is no longer available in the library.");
          return load(refreshed, false);
        }
      };
      const request = load(source, true).catch((error: unknown) => {
        if (valid()) {
          openRequest.current = null;
          setProcessing({ kind: "failed", message: message(error) });
        }
        throw error;
      });
      openRequest.current = request;
      return request;
    },
    [dependencies],
  );
  useEffect(() => {
    if (model && !model.index && processing.kind !== "failed")
      void open(model).catch(() => {});
  }, [model, open]);

  const inspect = (asset: AssetType) => {
    if (!model) return;
    const current = ++selectionGeneration.current;
    const sourceGeneration = modelGeneration.current;
    const valid = () =>
      current === selectionGeneration.current &&
      sourceGeneration === modelGeneration.current &&
      alive.current;
    setInspection({ kind: "loading", asset });
    work.current = work.current
      .catch(() => {})
      .then(async () => {
        if (!valid()) return;
        try {
          const catalog = await open(model);
          if (!valid() || !client.current) return;
          const currentAsset = catalog.types.find((type) => type.id === asset.id);
          if (!currentAsset) throw new Error(
            "This type is absent from the current source revision. Choose a current asset type.",
          );
          let properties = await client.current.readProperties({
            modelId: model.id,
            elementId: currentAsset.representativeId,
          });
          if (!valid()) return;
          let geometry: PreviewGeometry | null = null;
          let elementId = currentAsset.representativeId;
          let geometryNotice =
            "No preview geometry is available for this type.";
          for (const occurrence of [
            currentAsset.representativeId,
            ...currentAsset.occurrenceIds.filter(
              (id) => id !== currentAsset.representativeId,
            ),
          ]) {
            if (!valid()) return;
            try {
              const result = await client.current.readGeometry({
                modelId: model.id,
                elementId: occurrence,
              });
              if (result.meshes.length) {
                geometry = result;
                elementId = occurrence;
                geometryNotice = "";
                break;
              }
            } catch (error) {
              geometryNotice = `No preview geometry. ${message(error)}`;
            }
          }
          if (!valid()) return;
          if (elementId !== currentAsset.representativeId)
            properties = await client.current.readProperties({
              modelId: model.id,
              elementId,
            });
          if (!geometry && valid()) {
            client.current.dispose();
            openRequest.current = null;
          }
          if (valid())
            setInspection({
              kind: "ready",
              asset: currentAsset,
              properties,
              geometry,
              notice: geometryNotice,
              elementId,
            });
        } catch (error) {
          if (valid()) {
            client.current?.dispose();
            openRequest.current = null;
            setInspection({ kind: "failed", asset, message: message(error) });
          }
        }
      });
  };
  const closeInspector = () => {
    selectionGeneration.current++;
    setInspection({ kind: "closed" });
  };
  const retry = () => {
    if (model) {
      invalidate();
      setInspection({ kind: "closed" });
      void open(model).catch(() => {});
    }
  };
  const hide = async () => {
    if (!model) return;
    const removed = model.id;
    invalidate();
    setInspection({ kind: "closed" });
    try {
      await dependencies.api.hide(removed);
    } catch (error) {
      if (alive.current)
        setProcessing({
          kind: "failed",
          message: "Processing stopped during removal. You can retry.",
        });
      throw error;
    }
    if (!alive.current) return;
    inventoryGeneration.current++;
    setInventory({ kind: "ready" });
    const remaining = models.filter((item) => item.id !== removed);
    setModels(remaining);
    chooseModel(
      (
        remaining.find((item) => item.name.toUpperCase() === "BS19.IFC") ??
        remaining.find((item) => item.index) ??
        remaining[0]
      )?.id ?? "",
    );
  };
  const upload = async (file: File, onProgress: (percent: number) => void) => {
    const saved = await dependencies.api.upload(file, onProgress);
    if (!alive.current) return;
    inventoryGeneration.current++;
    setInventory({ kind: "ready" });
    setModels((previous) => [...previous, saved]);
    chooseModel(saved.id);
    await refresh(true);
  };
  return {
    models,
    model,
    inventory,
    processing,
    inspection,
    notice,
    chooseModel,
    inspect,
    closeInspector,
    retry,
    refresh,
    hide,
    upload,
  };
}
