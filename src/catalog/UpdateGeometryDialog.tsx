import { useEffect, useRef, useState } from "react";
import type { CreationIndex } from "../../shared/asset-creation.js";
import type { AssetUploadDetails, CatalogCategory, LibraryEntry, LibrarySnapshot } from "../../shared/catalog-library.js";
import type { LibraryModel } from "../../shared/contracts.js";
import { Dialog } from "../components/Dialog.js";
import { AssetInspector, type ViewerLoader } from "../components/AssetInspector.js";
import type { LibraryApi } from "../library/api.js";
import type { Inspection, LibraryWorker } from "../library/useLibrary.js";
import type { CatalogAction } from "./api.js";
import { previewCandidate } from "./useDefinitionPreview.js";
import { encodeGeometry, type GeometryRecord } from "../../shared/mesh-geometry.js";
import { geometryApi as defaultGeometryApi, type GeometryApi } from "./geometry-api.js";
import { geometryFileAccept, geometryFileTypes, meshFormat } from "../viewer/geometry-files.js";
import type { ImportedGeometry } from "../viewer/import-geometry.js";
import { UploadAssetDetails } from "./UploadAssetDetails.js";
import type { CreationWorker } from "./useAssetCreation.js";
import { sourceObservationKey } from "../../shared/catalog-source-identity.js";

export function UpdateGeometryDialog({ entry, initialFiles, categories = [], sourceApi, meshApi = defaultGeometryApi, createWorker, createDetailsWorker, loadViewer, pending, error, onSave, onClose }: {
  entry?: LibraryEntry;
  initialFiles?: File[];
  categories?: CatalogCategory[];
  sourceApi: LibraryApi;
  meshApi?: GeometryApi;
  createWorker(): LibraryWorker;
  createDetailsWorker?(): CreationWorker;
  loadViewer: ViewerLoader;
  pending: boolean;
  error: string;
  onSave(action: CatalogAction): Promise<boolean>;
  onClose(): void;
}) {
  const [upload, setUpload] = useState<{ model: LibraryModel; index: CreationIndex; snapshot: LibrarySnapshot | null } | null>(null);
  const [selected, setSelected] = useState("");
  const [progress, setProgress] = useState("");
  const [localError, setLocalError] = useState("");
  const [inspection, setInspection] = useState<Inspection>({ kind: "closed" });
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [mesh, setMesh] = useState<ImportedGeometry | null>(null);
  const [name, setName] = useState("");
  const savedMesh = useRef<GeometryRecord | null>(null);
  const worker = useRef<Pick<LibraryWorker, "readGeometry" | "dispose"> | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; worker.current?.dispose(); };
  }, []);
  useEffect(() => {
    const candidate = upload?.index.candidates.find(candidate => candidate.key === selected);
    const asset = upload && previewCandidate(candidate, upload.model.id);
    const client = worker.current;
    if (!asset || !candidate || !client) { setInspection({ kind: "closed" }); return; }
    let active = true;
    setInspection({ kind: "loading", asset });
    void client.readGeometry({ modelId: asset.modelId, elementId: candidate.representativeId })
      .then(geometry => {
        if (!active) return;
        if (!geometry.meshes.length) throw Error("This asset has no preview geometry. Choose another asset or IFC file.");
        setInspection({ kind: "ready", asset, geometry, properties: [], elementId: candidate.representativeId, notice: "" });
      })
      .catch(cause => {
        if (active) setInspection({ kind: "failed", asset, message: cause instanceof Error ? cause.message : "Could not preview geometry." });
      });
    return () => { active = false; };
  }, [upload, selected, previewAttempt]);
  const uploadFiles = async (files: File[]) => {
    setLocalError("");
    setUpload(null);
    setMesh(null);
    savedMesh.current = null;
    setInspection({ kind: "closed" });
    worker.current?.dispose();
    worker.current = null;
    const models = files.filter(file => /\.ifc$/i.test(file.name) || meshFormat(file.name));
    const file = models[0];
    if (!file || models.length !== 1) { setLocalError("Choose one 3D model and any .bin or .mtl companion files."); return; }
    if (!/\.ifc$/i.test(file.name)) {
      setProgress("Reading 3D model…");
      try {
        const { importGeometry } = await import("../viewer/import-geometry.js");
        const imported = await importGeometry(files);
        if (!alive.current) return;
        setMesh(imported);
        if (!entry) setName(file.name.replace(/\.[^.]+$/, ""));
        const asset = { id: file.name, modelId: "local-preview", typeGlobalId: null, elementGlobalId: file.name,
          name: file.name, ifcClass: imported.format.toUpperCase(), categories: [], occurrenceIds: [1], representativeId: 1 };
        setInspection({ kind: "ready", asset, geometry: imported.geometry, properties: [], elementId: 1, notice: "" });
      } catch (cause) {
        if (alive.current) setLocalError(cause instanceof Error ? cause.message : "Could not preview the 3D model.");
      } finally { if (alive.current) setProgress(""); }
      return;
    }
    setProgress("Uploading IFC…");
    const detailsClient = !entry && createDetailsWorker ? createDetailsWorker() : null;
    const client = detailsClient ?? createWorker();
    worker.current = client;
    const report = (message: string) => { if (alive.current) setProgress(message); };
    try {
      const model = await sourceApi.upload(file, percent => report(`Uploading IFC… ${percent}%`));
      if (!alive.current) return;
      report("Reading IFC geometry…");
      await client.openModel({ model, fileUrl: `/api/models/${model.id}/file`, purpose: "creation", onProgress: report });
      if (!alive.current) return;
      const index = await client.discoverAssets({ modelId: model.id, onProgress: report });
      if (!alive.current) return;
      const first = index.candidates.find(candidate => candidate.name === entry?.definition.name) ?? index.candidates[0];
      if (!first) throw Error("No assets were found in this IFC file. Choose another file.");
      await sourceApi.saveCreationIndex(index);
      if (!alive.current) return;
      const snapshot = detailsClient ? await detailsClient.analyzeAssets({ modelId: model.id, onProgress: report }) : null;
      if (!alive.current) return;
      setUpload({ model, index, snapshot });
      setSelected(first.key);
      if (!entry) setName(first.name);
    } catch (cause) {
      if (alive.current) setLocalError(cause instanceof Error ? cause.message : "Could not read the IFC file.");
      client.dispose();
      worker.current = null;
    } finally {
      if (alive.current) setProgress("");
    }
  };
  useEffect(() => { if (initialFiles?.length) void uploadFiles(initialFiles); }, [initialFiles]);
  const save = async (details?: AssetUploadDetails) => {
    if (mesh && inspection.kind === "ready") {
      setProgress("Saving geometry…");
      setLocalError("");
      try {
        const record = savedMesh.current ?? await meshApi.save({ name: mesh.name, format: mesh.format, geometry: encodeGeometry(mesh.geometry) });
        savedMesh.current = record;
        if (!alive.current) return;
        const geometryReference = { kind: "mesh", geometryId: record.id } satisfies NonNullable<LibraryEntry["geometryReference"]>;
        const saved = await onSave(entry ? { kind: "update-geometry", entryId: entry.id, geometryReference }
          : { kind: "create-asset", name: details?.name ?? name, geometryReference, ...(details ? { details } : {}) });
        if (alive.current && saved) onClose();
      } catch (cause) {
        if (alive.current) setLocalError(cause instanceof Error ? cause.message : "Could not save geometry.");
      } finally { if (alive.current) setProgress(""); }
      return;
    }
    const candidate = upload?.index.candidates.find(candidate => candidate.key === selected);
    if (!upload || !candidate || inspection.kind !== "ready" || inspection.asset.id !== selected || inspection.asset.modelId !== upload.model.id) return;
    setLocalError("");
    setProgress("Saving geometry…");
    try {
      const geometryReference = { modelId: upload.model.id, fingerprint: upload.model.fingerprint, candidateKey: candidate.key, occurrenceId: candidate.representativeId };
      const saved = await onSave(entry ? { kind: "update-geometry", entryId: entry.id, geometryReference }
        : upload.snapshot && details ? { kind: "import-asset", snapshot: upload.snapshot, candidateKey: selected, details }
        : { kind: "create-asset", name: details?.name ?? name, geometryReference, ...(details ? { details } : {}) });
      if (alive.current && saved) onClose();
    } catch (cause) {
      if (alive.current) setLocalError(cause instanceof Error ? cause.message : "Could not update geometry.");
    } finally {
      if (alive.current) setProgress("");
    }
  };
  const previewReady = mesh ? inspection.kind === "ready" : upload && inspection.kind === "ready" && inspection.asset.id === selected && inspection.asset.modelId === upload.model.id;
  return <Dialog title={entry ? "Update geometry" : "Create asset from 3D model"} onClose={onClose} busy={pending || !!progress} className={`author-dialog update-geometry-dialog ${!entry ? "asset-mapping-dialog" : ""}`}>
    <p>{entry ? `Upload a new 3D model for ${entry.definition.name}, inspect the preview, then save the geometry update.` : "Preview the geometry, fill in or map the asset details, then save the asset to your library."}</p>
    {(localError || error) && <p role="alert">{localError || error}</p>}
    <label>3D model files
      <input type="file" accept={geometryFileAccept} multiple disabled={pending || !!progress} onChange={event => {
        const files = Array.from(event.target.files ?? []);
        if (files.length) void uploadFiles(files);
      }} />
    </label>
    <p>Supported models: {geometryFileTypes}. Select a glTF’s .bin files or an OBJ’s .mtl file together with the model. Basic colors and transparency are preserved; texture images are not used.</p>
    {progress && <p role="status">{progress}</p>}
    {upload && <>
      <p>{upload.model.name}</p>
      <label>Geometry asset
        <select value={selected} disabled={pending || !!progress} onChange={event => { setInspection({ kind: "closed" }); setSelected(event.target.value); }}>
          {upload.index.candidates.map(candidate => <option key={candidate.key} value={candidate.key}>{candidate.name || "Unnamed asset"} · {candidate.ifcClass}</option>)}
        </select>
      </label>
    </>}
    {mesh && <p>{mesh.name}</p>}
    <div className={!entry ? "asset-authoring-layout" : undefined}>
    {(upload || mesh) && <section className="geometry-update-preview" aria-label="New geometry preview">
        <h3>New geometry preview</h3>
        <AssetInspector inspection={inspection} presentation="window" content="geometry" loadViewer={loadViewer}
          onClose={onClose} onRetry={() => setPreviewAttempt(attempt => attempt + 1)} />
      </section>}
    {!entry && previewReady && <UploadAssetDetails key={mesh?.name ?? selected} name={upload?.index.candidates.find(candidate => candidate.key === selected)?.name ?? name}
      source={upload?.snapshot?.types.find(type => sourceObservationKey(type) === selected) ?? null} categories={categories}
      occurrenceId={inspection.kind === "ready" ? inspection.elementId : null} pending={pending || !!progress}
      onSubmit={details => void save(details)} />}
    </div>
    {(entry || !previewReady) && <div className="action-row"><button className="primary" disabled={!previewReady || (!entry && !name.trim()) || pending || !!progress} onClick={() => void save()}>{entry ? "Save geometry" : "Save asset"}</button></div>}
  </Dialog>;
}
