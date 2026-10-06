import { useEffect, useRef, useState } from "react";
import type { LibraryModel } from "../../shared/contracts.js";
import type { IfcWorkerClient } from "../ifc/client.js";
import type { LibraryApi } from "../library/api.js";
import type { LibrarySnapshot } from "../../shared/catalog-library.js";
export type AnalysisWorker = Pick<
  IfcWorkerClient,
  "openModel" | "analyzeLibrary" | "dispose"
>;
export function useSourceAnalysis(
  createWorker: () => AnalysisWorker,
  api: LibraryApi,
  save: (snapshot: LibrarySnapshot) => Promise<boolean>,
) {
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const worker = useRef<AnalysisWorker | null>(null),
    generation = useRef(0),
    alive = useRef(true);
  const cancel = () => {
    generation.current++;
    worker.current?.dispose();
    worker.current = null;
    setProgress("");
    setSaving(false);
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      worker.current?.dispose();
    };
  }, []);
  const analyze = async (model: LibraryModel) => {
    cancel();
    const version = generation.current;
    const client = createWorker();
    worker.current = client;
    setError("");
    setNotice("");
    const valid = () => alive.current && version === generation.current;
    const onProgress = (value: string) => {
      if (valid()) setProgress(value);
    };
    try {
      onProgress("Opening source for analysis…");
      const index = await client.openModel({
        model,
        fileUrl: `/api/models/${model.id}/file`,
        onProgress,
      });
      if (!valid()) return;
      await api.saveIndex(index);
      if (!valid()) return;
      const snapshot = await client.analyzeLibrary({
        modelId: model.id,
        onProgress,
      });
      if (!valid()) return;
      onProgress("Saving drafts…");
      setSaving(true);
      const saved = await save(snapshot);
      if (valid() && saved)
        setNotice("Analysis imported. Open Needs review to curate the drafts.");
    } catch (cause) {
      if (valid())
        setError(cause instanceof Error ? cause.message : "Analysis failed.");
    } finally {
      client.dispose();
      if (valid()) {
        worker.current = null;
        setProgress("");
        setSaving(false);
      }
    }
  };
  return { progress, error, notice, saving, analyze, cancel };
}
