import { useState } from "react";
import { FileUp } from "lucide-react";
import { Dialog } from "../components/Dialog.js";
import { useAssetCreation, type AssetCreationOptions } from "./useAssetCreation.js";

export function AssetCreationDialog({
  onClose,
  ...options
}: AssetCreationOptions & { onClose(importSubmitted?: boolean): void }) {
  const creation = useAssetCreation(options);
  const { stage } = creation;
  const [file, setFile] = useState<File | null>(null);
  const [page, setPage] = useState(0);
  const close = () => {
    creation.cancel();
    onClose(stage.kind === "importing");
  };
  const pages = stage.kind === "selection"
    ? Math.max(1, Math.ceil(stage.index.candidates.length / 50))
    : 1;
  const currentPage = Math.min(page, pages - 1);
  const step = stage.kind === "selection" || stage.kind === "importing"
    ? 1
    : stage.kind === "complete" ? 2 : 0;
  return <Dialog title="Create assets from IFC" onClose={close} className="asset-creation-dialog">
    <ol className="creation-steps" aria-label="Creation steps">
      {["Upload IFC", "Choose assets", "Review drafts"].map((label, index) => (
        <li key={label} aria-current={index === step ? "step" : undefined}>
          {index + 1}. {label}
        </li>
      ))}
    </ol>
    {stage.kind === "file" && <form onSubmit={event => { event.preventDefault(); if (file) { setPage(0); void creation.analyze(file); } }}>
      <div className="creation-file-zone">
        <FileUp size={32} strokeWidth={1.5} aria-hidden="true" />
        <h3>Start with your IFC file</h3>
        <p>Upload one asset or a complete model. Choose which reusable assets become drafts before anything enters review.</p>
        <label>IFC file<input type="file" accept=".ifc" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
        {file && <p>{file.name}</p>}
      </div>
      <p>Generic Hard Asset supplies classification. Every draft needs staff review before it appears in the Library.</p>
      <div className="dialog-actions">
        <button type="button" onClick={close}>Cancel</button>
        <button className="primary" disabled={!file}>Analyze IFC</button>
      </div>
    </form>}
    {(stage.kind === "uploading" || stage.kind === "analyzing" || stage.kind === "importing") && <div className="creation-progress" aria-live="polite" aria-atomic="true">
      <h3>{stage.fileName}</h3>
      <p role="status">{stage.kind === "uploading" ? `Uploading IFC… ${stage.percent}%` : stage.kind === "analyzing" ? stage.message : `Creating ${stage.count} review drafts…`}</p>
      {stage.kind === "uploading" && <progress aria-label="IFC upload progress" value={stage.percent} max={100} />}
      <p>{stage.kind === "importing" ? "Saving has started and may still finish if you close this dialog. Check Needs review for the result." : "You can close this dialog to stop analysis. An uploaded source file may remain in Sources."}</p>
      <div className="dialog-actions"><button onClick={close}>{stage.kind === "importing" ? "Close" : "Cancel"}</button></div>
    </div>}
    {stage.kind === "selection" && <>
      <div className="creation-selection-heading">
        <div><span className="eyebrow">ASSETS FOUND</span><h3>{stage.fileName}</h3></div>
        <span className="count-token">{stage.index.candidates.length}</span>
      </div>
      <p>Classified assets are selected for review. Unclassified objects and context require your choice. Each card is one reusable asset type or specification variant.</p>
      <div className="creation-selection-summary">
        <strong role="status">{stage.selected.size} selected of {stage.index.candidates.length} candidates</strong>
        <button onClick={creation.clearSelection}>Clear selection</button>
      </div>
      {!stage.index.candidates.length && <p>No reusable assets were found. Choose another IFC file.</p>}
      <div className="creation-candidates">
        {stage.index.candidates.slice(currentPage * 50, (currentPage + 1) * 50).map(candidate => (
          <label className={`creation-candidate ${stage.selected.has(candidate.key) ? "is-selected" : ""}`} key={candidate.key}>
            <input
              type="checkbox"
              aria-label={`Select ${candidate.name}`}
              checked={stage.selected.has(candidate.key)}
              onChange={() => creation.toggle(candidate.key)}
            />
            <span className="creation-candidate-content">
              <strong>{candidate.name}</strong>
              <span>{candidate.ifcClass} · {candidate.occurrenceIds.length} {candidate.occurrenceIds.length === 1 ? "occurrence" : "occurrences"}</span>
              <span>{candidate.categories.length ? `Generic Hard Asset: ${candidate.categories.join(" / ")}` : "Unclassified object or context"}</span>
              <span className="creation-review-label">Review required{candidate.classificationIssues.length ? ` · ${candidate.classificationIssues.join("; ")}` : ""}</span>
            </span>
          </label>
        ))}
      </div>
      {pages > 1 && <nav className="catalog-pagination" aria-label="Candidate pages">
        <span>Page {currentPage + 1} of {pages}</span>
        <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous candidates</button>
        <button disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next candidates</button>
      </nav>}
      <div className="dialog-actions">
        <button onClick={() => { setFile(null); creation.retry(); }}>Choose another IFC</button>
        <button className="primary" disabled={!stage.selected.size} onClick={() => void creation.importSelected()}>
          Create {stage.selected.size} {stage.selected.size === 1 ? "draft" : "drafts"}
        </button>
      </div>
    </>}
    {stage.kind === "failed" && <>
      <p role="alert">{stage.message}</p>
      <div className="dialog-actions">
        <button onClick={close}>Close</button>
        <button className="primary" onClick={() => { setFile(null); creation.retry(); }}>Try again</button>
      </div>
    </>}
    {stage.kind === "complete" && <p role="status">Drafts saved. Opening Needs review…</p>}
  </Dialog>;
}
