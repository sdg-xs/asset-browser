import { useEffect, useRef } from "react";
import type {
  CatalogLibrary,
  LibraryEntry,
} from "../../shared/catalog-library.js";
import type { LibraryApi } from "../library/api.js";
import type { LibraryWorker } from "../library/useLibrary.js";
import {
  AssetInspector,
  type ViewerLoader,
} from "../components/AssetInspector.js";
import { isFireRelatedAsset, libraryParameters } from "./display.js";
import { useDefinitionPreview } from "./useDefinitionPreview.js";
import type { GeometryApi } from "./geometry-api.js";
export function DefinitionInspector({
  state,
  entry,
  sourceApi,
  meshApi,
  createWorker,
  loadViewer,
  pending,
  error,
  onClose,
  onEdit,
  onGeometry,
  modal = false,
}: {
  state: CatalogLibrary;
  entry: LibraryEntry;
  sourceApi: LibraryApi;
  meshApi?: GeometryApi;
  createWorker(): LibraryWorker;
  loadViewer: ViewerLoader;
  pending: boolean;
  error: string;
  onClose(): void;
  onEdit(): void;
  onGeometry(): void;
  modal?: boolean;
}) {
  const preview = useDefinitionPreview(state, entry, sourceApi, createWorker, meshApi);
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
  return (
    <aside
      className={`definition-inspector ${modal ? "in-dialog" : ""}`}
      aria-label="Definition inspector"
      onKeyDown={(e) => {
        if (!modal && e.key === "Escape") onClose();
      }}
    >
      {!modal && <div className="inspector-heading">
        <span>DEFINITION</span>
        <button ref={close} aria-label="Close inspector" onClick={onClose}>
          ×
        </button>
      </div>}
      <div className="definition-content">
        {modal && error && <p role="alert">{error}</p>}
        {modal && pending && <p role="status">Saving catalog…</p>}
        <span className="eyebrow">
          {state.categories.find((c) => c.id === entry.definition.categoryId)
            ?.name ?? "Uncategorized"}
        </span>
        <div className="definition-title-row">
          <h2>{isFireRelatedAsset(state, entry) && <><span role="img" aria-label="Fire-related asset">🔥</span>{" "}</>}{entry.definition.name}</h2>
          <div className="action-row definition-title-actions">
            <button onClick={onEdit} disabled={pending}>Edit definition</button>
            <button onClick={onGeometry} disabled={pending}>Update geometry</button>
          </div>
        </div>
        <p>{entry.definition.description}</p>
        {entry.definition.kind === "product" && (
          <p>
            {entry.definition.manufacturer.value} ·{" "}
            {entry.definition.model.value}
          </p>
        )}
        <div className="definition-preview-layout">
        <section className="definition-parameters">
        <h3>Parameters</h3>
        <dl className="definition-specs">
          {libraryParameters(state, entry).map(parameter => (
            <div key={parameter.label}>
              <dt>{parameter.label}</dt>
              <dd>{parameter.value}</dd>
            </div>
          ))}
        </dl>
        </section>
        <section className="definition-geometry">
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
        </section>
        </div>
      </div>
    </aside>
  );
}
