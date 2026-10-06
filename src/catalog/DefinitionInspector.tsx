import { referenceKey } from "../../shared/catalog-references.js";
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
import {
  entrySpecifications,
  fieldLabel,
  entryFieldLabel,
  valueText,
} from "./display.js";
import { useDefinitionPreview } from "./useDefinitionPreview.js";
export function DefinitionInspector({
  state,
  entry,
  sourceApi,
  createWorker,
  loadViewer,
  pending,
  error,
  onClose,
  onEdit,
  onReview,
  onAction,
  modal = false,
  reviewMode = false,
}: {
  state: CatalogLibrary;
  entry: LibraryEntry;
  sourceApi: LibraryApi;
  createWorker(): LibraryWorker;
  loadViewer: ViewerLoader;
  pending: boolean;
  error: string;
  onClose(): void;
  onEdit(): void;
  onReview(mode: "merge" | "split" | "geometry"): void;
  onAction(kind: "approve" | "archive" | "restore"): void;
  modal?: boolean;
  reviewMode?: boolean;
}) {
  const preview = useDefinitionPreview(state, entry, sourceApi, createWorker);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (modal) return;
    const previous = document.activeElement;
    const inspector = close.current?.closest("aside");
    close.current?.focus();
    return () => {
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        (document.activeElement === document.body ||
          inspector?.contains(document.activeElement))
      )
        previous.focus();
    };
  }, [entry.id, modal]);
  const issues = entryIssues(state, entry);
  const conflicts = reviewMode
    ? entryFieldSuggestions(state, entry).filter(
        (suggestion) => suggestion.status === "conflicting" &&
          !Object.hasOwn(entry.definition.specifications, suggestion.key),
      )
    : [];
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
        {modal && error && <p role="alert">{error}</p>}
        {modal && pending && <p role="status">Saving catalog…</p>}
        <span className="eyebrow">
          {state.categories.find((c) => c.id === entry.definition.categoryId)
            ?.name ?? "Uncategorized"}{" "}
          · {entry.definition.kind}
        </span>
        <h2>{entry.definition.name}</h2>
        <p>{entry.definition.description}</p>
        {reviewMode && entry.reviewFlags.length > 0 && (
          <p className="review-issues">
            Source changed. Published specifications are retained. Review its
            current observations and preferred geometry before accepting
            changes.
          </p>
        )}
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
                <dt>{entryFieldLabel(state, entry, key)}</dt>
                <dd>{valueText(value)}</dd>
              </div>
            ),
          )}
        </dl>
        {!Object.keys(entrySpecifications(state, entry)).length && (
          <p>No confirmed specifications yet.</p>
        )}
        {reviewMode && issues.length > 0 && (
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
          content="geometry"
        />
        {conflicts.length > 0 && <details className="review-issues">
          <summary>Source conflicts · {conflicts.length} unresolved</summary>
          {conflicts.map((s) => (
            <p key={s.key}>
              <strong>
                {fieldLabel(state, s.key, entry.definition.categoryId)}
              </strong>
              : {s.values.map(valueText).join(" / ")}
            </p>
          ))}
        </details>}
        <details>
          <summary>Source details</summary>
          {preview.inspection.kind === "ready" && preview.inspection.properties.length > 0 && (
            <section>
              <h4>Previewed IFC element</h4>
              {preview.inspection.properties.map((group, index) => (
                <details key={`${group.source}:${group.name}:${index}`} className="property-group">
                  <summary>{group.name || "Properties"} · {group.source}</summary>
                  <dl>
                    {group.values.map((property, propertyIndex) => (
                      <div key={propertyIndex}>
                        <dt>{property.name}</dt>
                        <dd>{property.value || "(blank)"}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              ))}
            </section>
          )}
          {entry.sourceReferences.map((r) => {
            const source = state.sources.find((s) => s.id === r.sourceId);
            return (
              <section key={referenceKey(r)}>
                <h4>{source?.sourceName}</h4>
                <p>
                  {source?.observation.name} · {source?.observation.ifcClass}
                </p>
                <p>Type: {source?.observation.typeGlobalId}</p>
                <p>
                  Referenced revision: {r.fingerprint}. Current observations:{" "}
                  {source?.fingerprint}.
                </p>
                <p>Occurrences: {r.occurrenceIds.join(", ")}</p>
                {source?.observation.fields.map((f) => (
                  <p key={f.key}>
                    {f.pset} / {f.name}:{" "}
                    {f.values
                      .map(
                        (v) =>
                          `${v.rawValue || "(blank)"} ${v.sourceUnit === undefined ? (f.unit ?? "Unknown unit") : (v.sourceUnit ?? "Unknown unit")} · ${v.sourceMeasure ?? f.measure}`,
                      )
                      .join(" / ")}
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
