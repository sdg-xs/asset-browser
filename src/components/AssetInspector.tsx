import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { X, Box } from "lucide-react";
import type { Inspection } from "../library/useLibrary.js";
import { loadAssetViewer } from "../viewer/load-viewer.js";
export type ViewerLoader = typeof loadAssetViewer;

class ViewerBoundary extends Component<
  { children: ReactNode; onRetry(): void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed)
      return (
        <div className="preview-message" role="alert">
          <p>
            The 3D viewer could not load. Check that the local library service
            is running, then retry the download.
          </p>
          <button onClick={this.props.onRetry}>Retry viewer download</button>
        </div>
      );
    return this.props.children;
  }
}

export function AssetInspector({
  inspection,
  onClose,
  onRetry,
  loadViewer = loadAssetViewer,
}: {
  inspection: Inspection;
  onClose(): void;
  onRetry(): void;
  loadViewer?: ViewerLoader;
}) {
  const [viewerAttempt, setViewerAttempt] = useState(0);
  const AssetViewer = useMemo(
    () => lazy(() => loadViewer(viewerAttempt)),
    [loadViewer, viewerAttempt],
  );
  const closeButton = useRef<HTMLButtonElement>(null);
  const selectedId = inspection.kind === "closed" ? "" : inspection.asset.id;
  useEffect(() => {
    if (!selectedId) return;
    const previous = document.activeElement;
    closeButton.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [selectedId]);
  if (inspection.kind === "closed") return null;
  const asset = inspection.asset;
  return (
    <aside
      className="inspector"
      aria-label="Asset inspector"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="inspector-heading">
        <span>ASSET DETAILS</span>
        <button
          ref={closeButton}
          className="icon-button"
          onClick={onClose}
          aria-label="Close inspector"
        >
          <X size={20} />
        </button>
      </div>
      <div className="inspector-title">
        <span className="eyebrow">{asset.categories.join(" · ")}</span>
        <h2>{asset.name || "Unnamed type"}</h2>
        <span>{asset.occurrenceIds.length} occurrences in source model</span>
      </div>
      {inspection.kind === "loading" && (
        <div className="preview-message" role="status">
          <Box size={30} />
          <p>Reading properties and representative geometry…</p>
        </div>
      )}
      {inspection.kind === "failed" && (
        <div className="inline-message" role="alert">
          <p>{inspection.message}</p>
          <button onClick={onRetry}>Retry inspection</button>
        </div>
      )}
      {inspection.kind === "ready" && (
        <>
          <div className="preview">
            {inspection.geometry ? (
              <ViewerBoundary
                key={viewerAttempt}
                onRetry={() => setViewerAttempt((attempt) => attempt + 1)}
              >
                <Suspense
                  fallback={
                    <div className="preview-message">Starting 3D viewer…</div>
                  }
                >
                  <AssetViewer geometry={inspection.geometry} />
                </Suspense>
              </ViewerBoundary>
            ) : (
              <div className="preview-message">
                <Box size={32} />
                <p>{inspection.notice}</p>
                <button onClick={onRetry}>Retry preview</button>
              </div>
            )}
          </div>
          <div className="preview-caption">
            Representative occurrence #{inspection.elementId}
          </div>
          <section className="property-section">
            <div className="property-heading">
              <h3>Read-only properties</h3>
              <span>IFC</span>
            </div>
            <details className="property-group">
              <summary>Type identity</summary>
              <dl>
                <div>
                  <dt>IFC class</dt>
                  <dd>{asset.ifcClass}</dd>
                </div>
                <div>
                  <dt>GlobalId</dt>
                  <dd>{asset.typeGlobalId}</dd>
                </div>
              </dl>
            </details>
            {inspection.properties.map((group, i) => (
              <details
                className="property-group"
                key={`${group.source}:${group.name}:${i}`}
                open={group.name === "Identity Data"}
              >
                <summary>
                  {group.name || "Properties"}
                  <span>{group.source}</span>
                </summary>
                <dl>
                  {group.values.map((property, j) => (
                    <div key={j}>
                      <dt>{property.name}</dt>
                      <dd>{property.value || "(blank)"}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ))}
            {!inspection.properties.length && (
              <p>No property groups in this occurrence.</p>
            )}
          </section>
        </>
      )}
    </aside>
  );
}
