import { useEffect, useRef } from "react";
import type {
  CatalogLibrary,
  LibraryEntry,
} from "../../shared/catalog-library.js";
import {
  entryIssues,
  entryFieldSuggestions,
} from "../../shared/catalog-rules.js";
import type { LibraryApi } from "../library/api.js";
import type { LibraryWorker } from "../library/useLibrary.js";
import {
  AssetInspector,
  type ViewerLoader,
} from "../components/AssetInspector.js";
import { entrySpecifications, fieldLabel, valueText } from "./display.js";
import { useDefinitionPreview } from "./useDefinitionPreview.js";
export function DefinitionInspector({
  state,
  entry,
  sourceApi,
  createWorker,
  loadViewer,
  pending,
  onClose,
  onEdit,
  onReview,
  onAction,
  modal = false,
}: {
  state: CatalogLibrary;
  entry: LibraryEntry;
  sourceApi: LibraryApi;
  createWorker(): LibraryWorker;
  loadViewer: ViewerLoader;
  pending: boolean;
  onClose(): void;
  onEdit(): void;
  onReview(mode: "merge" | "split" | "geometry"): void;
  onAction(kind: "approve" | "archive" | "restore"): void;
  modal?: boolean;
}) {
  const preview = useDefinitionPreview(state, entry, sourceApi, createWorker);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (modal) return;
    const previous = document.activeElement;
    close.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [entry.id, modal]);
  const issues = entryIssues(state, entry);
  return (
    <aside
      className={`definition-inspector ${modal ? "in-dialog" : ""}`}
      aria-label="Definition inspector"
      onKeyDown={(e) => {
        if (!modal && e.key === "Escape") onClose();
      }}
    >
      <div className="inspector-heading">
        <span>DEFINITION</span>
        {!modal && (
          <button ref={close} aria-label="Close inspector" onClick={onClose}>
            ×
          </button>
        )}
      </div>
      <div className="definition-content">
        <span className="eyebrow">
          {state.categories.find((c) => c.id === entry.definition.categoryId)
            ?.name ?? "Uncategorized"}{" "}
          · {entry.definition.kind}
        </span>
        <h2>{entry.definition.name}</h2>
        <p>{entry.definition.description}</p>
        {entry.definition.kind === "product" && (
          <p>
            {entry.definition.manufacturer.value} ·{" "}
            {entry.definition.model.value}
          </p>
        )}
        <h3>Specifications</h3>
        <dl className="definition-specs">
          {Object.entries(entrySpecifications(state, entry)).map(
            ([key, value]) => (
              <div key={key}>
                <dt>{fieldLabel(state, key)}</dt>
                <dd>{valueText(value)}</dd>
              </div>
            ),
          )}
        </dl>
        {!Object.keys(entrySpecifications(state, entry)).length && (
          <p>No confirmed specifications yet.</p>
        )}
        {issues.length > 0 && (
          <details className="review-issues">
            <summary>{issues.length} review issues</summary>
            <ul>
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </details>
        )}
        <div className="action-row">
          <button onClick={onEdit} disabled={pending}>
            Edit definition
          </button>
          {entry.status === "draft" && (
            <button
              className="primary"
              onClick={() => onAction("approve")}
              disabled={pending}
            >
              Approve definition
            </button>
          )}
          {entry.status === "archived" ? (
            <button onClick={() => onAction("restore")} disabled={pending}>
              Restore draft
            </button>
          ) : (
            <button onClick={() => onAction("archive")} disabled={pending}>
              Archive definition
            </button>
          )}
        </div>
        <div className="action-row">
          <button onClick={() => onReview("geometry")}>
            Preferred geometry
          </button>
          {entry.status !== "archived" && (
            <>
              <button onClick={() => onReview("merge")}>
                Compare duplicates
              </button>
              <button onClick={() => onReview("split")}>Split variants</button>
            </>
          )}
        </div>
        <h3>Representative geometry</h3>
        {preview.message && (
          <div className="preview-message">
            <p role="status">{preview.message}</p>
            <button onClick={preview.retry}>Retry preview</button>
          </div>
        )}
        <AssetInspector
          inspection={preview.inspection}
          presentation="window"
          onClose={onClose}
          onRetry={preview.retry}
          loadViewer={loadViewer}
        />
        <details>
          <summary>Source observations and conflicts</summary>
          {entryFieldSuggestions(state, entry).map((s) => (
            <p key={s.key}>
              <strong>{fieldLabel(state, s.key)}</strong>:{" "}
              {s.values.map(valueText).join(" / ") || "Unknown"} · {s.status}
              {s.key in entry.definition.specifications
                ? " (resolved by override)"
                : ""}
            </p>
          ))}
        </details>
        <details>
          <summary>Source references and original values</summary>
          {entry.sourceReferences.map((r) => {
            const source = state.sources.find((s) => s.id === r.sourceId);
            return (
              <section key={r.sourceId}>
                <h4>{source?.sourceName}</h4>
                <p>
                  {source?.observation.name} · {source?.observation.ifcClass}
                </p>
                <p>Type: {source?.observation.typeGlobalId}</p>
                <p>Occurrences: {r.occurrenceIds.join(", ")}</p>
                {source?.observation.fields.map((f) => (
                  <p key={f.key}>
                    {f.pset} / {f.name}:{" "}
                    {f.values.map((v) => v.rawValue || "(blank)").join(" / ")}{" "}
                    {f.unit ?? ""}
                  </p>
                ))}
              </section>
            );
          })}
        </details>
      </div>
    </aside>
  );
}
