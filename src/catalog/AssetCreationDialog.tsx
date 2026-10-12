import { useMemo, useState } from "react";
import { FileUp } from "lucide-react";
import { Dialog } from "../components/Dialog.js";
import { useAssetCreation, type AssetCreationOptions } from "./useAssetCreation.js";
import { creationTypeRows } from "./creation-groups.js";
import { geometryFileAccept, geometryFileTypes, meshFormat } from "../viewer/geometry-files.js";
import { AssetInspector, type ViewerLoader } from "../components/AssetInspector.js";
import { loadAssetViewer } from "../viewer/load-viewer.js";
import { AiAssetDraft } from "./AiAssetDraft.js";
import { UploadAssetDetails } from "./UploadAssetDetails.js";
import { sourceObservationKey } from "../../shared/catalog-source-identity.js";
import type { CatalogCategory } from "../../shared/catalog-library.js";

export function AssetCreationDialog({
  onClose,
  onGeometryFiles,
  loadViewer = loadAssetViewer,
  categories = [],
  ...options
}: AssetCreationOptions & { onClose(importSubmitted?: boolean): void; onGeometryFiles?(files: File[]): void; loadViewer?: ViewerLoader; categories?: CatalogCategory[] }) {
  const creation = useAssetCreation(options);
  const { stage } = creation;
  const [file, setFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [page, setPage] = useState(0);
  const index = stage.kind === "selection" ? stage.index : null;
  const snapshot = stage.kind === "selection" ? stage.snapshot : null;
  const selectedKey = stage.kind === "selection" ? [...stage.selected][0] : undefined;
  const selectedSource = snapshot?.types.find(type => sourceObservationKey(type) === selectedKey) ?? null;
  const rows = useMemo(() => index && snapshot ? creationTypeRows(index, snapshot) : [], [index, snapshot]);
  const selectedTypes = stage.kind === "selection"
    ? rows.filter(row => row.candidateKeys.some(key => stage.selected.has(key))).length : 0;
  const classificationWorkload = useMemo(() => index?.candidates.filter(candidate =>
    !candidate.categories.length || candidate.categories.length > 1 || candidate.classificationIssues.length > 0,
  ).length ?? 0, [index]);
  const close = () => {
    creation.cancel();
    onClose(stage.kind === "importing");
  };
  const pages = stage.kind === "selection"
    ? Math.max(1, Math.ceil(rows.length / 50))
    : 1;
  const currentPage = Math.min(page, pages - 1);
  const categoryRows = new Map<string, typeof rows>();
  for (const row of rows.slice(currentPage * 50, (currentPage + 1) * 50)) {
    const group = categoryRows.get(row.category) ?? [];
    group.push(row);
    categoryRows.set(row.category, group);
  }
  const step = stage.kind === "selection" || stage.kind === "importing"
    ? 1
    : stage.kind === "complete" ? 2 : 0;
  return <Dialog title={onGeometryFiles ? "Create asset" : "Create asset from IFC"} onClose={close} className={`asset-creation-dialog ${stage.kind === "selection" ? "asset-mapping-dialog" : stage.kind === "file" ? "asset-creation-options-dialog" : ""}`}>
    <ol className="creation-steps" aria-label="Creation steps">
      {[onGeometryFiles ? "Create asset" : "Upload IFC", "Preview and fill asset details", "Saved asset"].map((label, index) => (
        <li key={label} aria-current={index === step ? "step" : undefined}>
          {index + 1}. {label}
        </li>
      ))}
    </ol>
    {stage.kind === "file" && <div className="creation-methods">
      <section className="creation-method creation-upload" aria-label="Create asset from model">
      <header className="creation-method-heading"><h3><FileUp size={18} aria-hidden="true" /> Upload model</h3></header>
      <form onSubmit={event => { event.preventDefault(); if (file) {
      if (files.filter(file => /\.ifc$/i.test(file.name) || meshFormat(file.name)).length > 1) { setUploadError("Choose one 3D model and its companion files."); return; }
      if (onGeometryFiles && !/\.ifc$/i.test(file.name)) { onGeometryFiles(files); return; }
      setPage(0); void creation.analyze(file);
    } }}>
      <div className="creation-file-zone">
        <FileUp size={32} strokeWidth={1.5} aria-hidden="true" />
        <h3>{onGeometryFiles ? "Start with your 3D model" : "Start with your IFC file"}</h3>
        <p>{onGeometryFiles ? `Supported models: ${geometryFileTypes}. For glTF or OBJ, select any .bin or .mtl companion files together with the model.` : "Upload an asset IFC. If it contains several types, choose one reusable asset to preview and save to your library."}</p>
        <label>{onGeometryFiles ? "3D model files" : "IFC file"}<input type="file" accept={onGeometryFiles ? geometryFileAccept : ".ifc"} multiple={!!onGeometryFiles} onChange={event => {
          const selected = Array.from(event.target.files ?? []);
          setUploadError("");
          setFiles(selected);
          setFile(selected.find(file => /\.ifc$/i.test(file.name) || meshFormat(file.name)) ?? selected[0] ?? null);
        }} /></label>
        {file && <p>{file.name}</p>}
        {uploadError && <p role="alert">{uploadError}</p>}
      </div>
      <p>Generic Hard Asset supplies classification. Saved assets appear directly in the Library.</p>
      <div className="dialog-actions">
        <button type="button" onClick={close}>Cancel</button>
        <button className="primary" disabled={!file}>{file && !/\.ifc$/i.test(file.name) && onGeometryFiles ? "Preview model" : "Analyze IFC"}</button>
      </div>
    </form>
      </section>
      <AiAssetDraft />
    </div>}
    {(stage.kind === "uploading" || stage.kind === "analyzing" || stage.kind === "importing") && <div className="creation-progress" aria-live="polite" aria-atomic="true">
      <h3>{stage.fileName}</h3>
      <p role="status">{stage.kind === "uploading" ? `Uploading IFC… ${stage.percent}%` : stage.kind === "analyzing" ? stage.message : "Saving asset…"}</p>
      {stage.kind === "uploading" && <progress aria-label="IFC upload progress" value={stage.percent} max={100} />}
      <p>{stage.kind === "importing" ? "Saving has started and may still finish if you close this dialog. Check Library for the result." : "You can close this dialog to stop processing the IFC file."}</p>
      <div className="dialog-actions"><button onClick={close}>{stage.kind === "importing" ? "Close" : "Cancel"}</button></div>
    </div>}
    {stage.kind === "selection" && <>
      <div className="creation-selection-heading">
        <div><span className="eyebrow">ASSETS FOUND</span><h3>{stage.fileName}</h3></div>
        <span className="count-token">{rows.length}</span>
      </div>
      <p>Choose one asset type. Preview one representative instance before saving the asset to your library. Repeated type names are listed once; the first definition supplies its geometry and metadata.</p>
      <p>{stage.index.stats.elements.toLocaleString()} physical occurrences · {(stage.index.stats.elements - stage.index.stats.candidates).toLocaleString()} repeated occurrences · {classificationWorkload.toLocaleString()} {classificationWorkload === 1 ? "candidate needs" : "candidates need"} classification</p>
      <div className="creation-selection-summary">
        <strong role="status">{selectedTypes} selected of {rows.length} types · one asset per upload</strong>
        <button onClick={creation.clearSelection}>Clear selection</button>
      </div>
      {!stage.index.candidates.length && <p>No reusable assets were found. Choose another IFC file.</p>}
      <div className="creation-candidates">
        {[...categoryRows].map(([category, types]) => <section className="creation-category" key={category}>
          <h4>{category}</h4>
          {types.map(candidate => (
          <label className={`creation-candidate ${stage.selected.has(candidate.key) ? "is-selected" : ""}`} key={candidate.key}>
            <input
              type="radio"
              name="asset-type"
              aria-label={`Select ${candidate.name}`}
              checked={stage.selected.has(candidate.key)}
              onChange={() => creation.toggle([candidate.key])}
            />
            <span className="creation-candidate-content">
              <strong>{candidate.name}</strong>
              <span>{candidate.ifcClass} · {candidate.occurrenceIds.length} {candidate.occurrenceIds.length === 1 ? "occurrence" : "occurrences"}</span>
              <span>{candidate.categories.length ? `Generic Hard Asset: ${candidate.categories.join(" / ")}` : "Unclassified object or context"}</span>
              {candidate.classificationIssues.length > 0 && <span className="creation-review-label">{candidate.classificationIssues.join("; ")}</span>}
            </span>
          </label>
          ))}
        </section>)}
      </div>
      {pages > 1 && <nav className="catalog-pagination" aria-label="Candidate pages">
        <span>Page {currentPage + 1} of {pages}</span>
        <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous candidates</button>
        <button disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next candidates</button>
      </nav>}
      <div className="asset-authoring-layout">
      {creation.inspection.kind !== "closed" && <section className="geometry-update-preview" aria-label="Selected asset geometry">
        <h3>Selected asset geometry</h3>
        <AssetInspector inspection={creation.inspection} onClose={() => {}} onRetry={creation.retryPreview}
          loadViewer={loadViewer} presentation="window" content="geometry" />
      </section>}
      {creation.inspection.kind === "ready" && stage.selected.has(creation.inspection.asset.id) && <UploadAssetDetails
        key={creation.inspection.asset.id} name={creation.inspection.asset.name}
        source={selectedSource} categories={categories}
        occurrenceId={creation.inspection.elementId} pending={false}
        onSubmit={details => void creation.importSelected(details)} />}
      </div>
      <div className="dialog-actions">
        <button onClick={() => { setFile(null); creation.retry(); }}>Choose another IFC</button>
        {creation.inspection.kind !== "ready" && <button className="primary" disabled>
            Save asset
        </button>}
      </div>
    </>}
    {stage.kind === "failed" && <>
      <p role="alert">{stage.message}</p>
      <div className="dialog-actions">
        <button onClick={close}>Close</button>
        <button className="primary" onClick={() => { setFile(null); creation.retry(); }}>Try again</button>
      </div>
    </>}
    {stage.kind === "complete" && <p role="status">Asset saved to your library.</p>}
  </Dialog>;
}
