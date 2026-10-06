import { useEffect, useState } from "react";
import type {
  CatalogLibrary,
  LibraryEntry,
  SourceReference,
} from "../../shared/catalog-library.js";
import type { LibraryModel, PreviewAsset } from "../../shared/contracts.js";
import type { CreationCandidate } from "../../shared/asset-creation.js";
import { sourceObservationKey } from "../../shared/catalog-source-identity.js";
import type { LibraryApi } from "../library/api.js";
import type { Inspection, LibraryWorker } from "../library/useLibrary.js";
export function geometrySource(
  state: CatalogLibrary,
  reference: SourceReference,
  models: LibraryModel[],
) {
  const source = state.sources.find(
    (s) =>
      s.id === reference.sourceId &&
      s.current &&
      s.fingerprint === reference.fingerprint,
  );
  const model =
    source &&
    models.find(
      (m) =>
        m.id === source.modelId &&
        m.fingerprint === reference.fingerprint,
    );
  const asset = source?.analysisVersion === 3
    ? model && model.creationIndex?.modelId === model.id && model.creationIndex.fingerprint === reference.fingerprint
      ? previewCandidate(model.creationIndex.candidates.find(candidate => candidate.key === sourceObservationKey(source.observation)), model.id)
      : undefined
    : model?.index?.fingerprint === reference.fingerprint && source?.observation.typeGlobalId !== null
      ? model.index.types.find(t => t.typeGlobalId === source?.observation.typeGlobalId)
      : undefined;
  if (
    !source ||
    !model ||
    !asset ||
    !reference.occurrenceIds.length ||
    !validMembership(source.observation.occurrenceIds, asset.occurrenceIds, reference.occurrenceIds)
  )
    return null;
  return { source, model, asset };
}
function previewCandidate(candidate: CreationCandidate | undefined, modelId: string): PreviewAsset | undefined {
  if (!candidate) return undefined;
  const common = {
    id: candidate.key,
    modelId,
    name: candidate.name,
    ifcClass: candidate.ifcClass,
    categories: candidate.categories,
    occurrenceIds: candidate.occurrenceIds,
    representativeId: candidate.representativeId,
  };
  return candidate.identity.kind === "type"
    ? { ...common, typeGlobalId: candidate.identity.globalId }
    : { ...common, typeGlobalId: null, elementGlobalId: candidate.identity.globalId };
}
function validMembership(saved: number[], current: number[], subset: number[]): boolean {
  return saved.length === current.length &&
    saved.every(id => current.includes(id)) &&
    subset.length > 0 &&
    new Set(subset).size === subset.length &&
    subset.every(id => current.includes(id));
}
export function useDefinitionPreview(
  state: CatalogLibrary,
  entry: LibraryEntry,
  api: LibraryApi,
  createWorker: () => LibraryWorker,
) {
  const [inspection, setInspection] = useState<Inspection>({ kind: "closed" }),
    [message, setMessage] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const worker = createWorker();
    setInspection({ kind: "closed" });
    setMessage("Checking current geometry sources…");
    const run = async () => {
      const models = await api.list();
      if (!active) return;
      const references = entry.sourceReferences.filter(
        (r, i) => i === 0 || r.equivalent,
      );
      let failure =
        "No current geometry source is available. Curated specifications remain usable.";
      for (const reference of references) {
        const match = geometrySource(state, reference, models);
        if (!match) continue;
        try {
          const index = await worker.openModel({
            model: match.model,
            fileUrl: `/api/models/${match.model.id}/file`,
            purpose: match.source.analysisVersion === 3 ? "creation" : "browse",
          });
          if (!active) return;
          const creationIndex = match.source.analysisVersion === 3
            ? await worker.discoverAssets({ modelId: match.model.id })
            : null;
          if (!active) return;
          const asset = creationIndex
            ? creationIndex.modelId === match.model.id && creationIndex.fingerprint === reference.fingerprint
              ? previewCandidate(creationIndex.candidates.find(candidate => candidate.key === sourceObservationKey(match.source.observation)), match.model.id)
              : undefined
            : index.modelId === match.model.id && index.fingerprint === reference.fingerprint
              ? index.types.find(
                  (t) =>
                    t.typeGlobalId === match.source.observation.typeGlobalId,
                )
              : undefined;
          if (
            !asset ||
            !validMembership(match.source.observation.occurrenceIds, asset.occurrenceIds, reference.occurrenceIds)
          ) {
            failure =
              "Source changed. Review and rebind its geometry before previewing.";
            continue;
          }
          setInspection({ kind: "loading", asset });
          for (const elementId of reference.occurrenceIds) {
            if (!active) return;
            try {
              const geometry = await worker.readGeometry({
                modelId: match.model.id,
                elementId,
              });
              if (!active) return;
              if (!geometry.meshes.length) continue;
              const properties = await worker.readProperties({
                modelId: match.model.id,
                elementId,
              });
              if (!active) return;
              setInspection({
                kind: "ready",
                asset,
                geometry,
                properties,
                elementId,
                notice: "",
              });
              setMessage("");
              return;
            } catch (cause) {
              failure =
                cause instanceof Error ? cause.message : "Preview unavailable.";
            }
          }
        } catch (cause) {
          failure =
            cause instanceof Error ? cause.message : "Preview unavailable.";
        } finally {
          worker.dispose();
        }
      }
      if (active) {
        setInspection({ kind: "closed" });
        setMessage(failure);
      }
    };
    void run().catch((cause) => {
      if (active) {
        setInspection({ kind: "closed" });
        setMessage(
          cause instanceof Error ? cause.message : "Preview unavailable.",
        );
      }
    });
    return () => {
      active = false;
      worker.dispose();
    };
  }, [state, entry, api, createWorker, attempt]);
  return { inspection, message, retry: () => setAttempt((a) => a + 1) };
}
