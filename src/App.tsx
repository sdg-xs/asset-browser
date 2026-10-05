import { useRef, useState } from "react";
import {
  Boxes,
  Grid2X2,
  List,
  Search,
  Plus,
  SlidersHorizontal,
  Trash2,
  FolderOpen,
  ArrowRight,
  LoaderCircle,
} from "lucide-react";
import { useLibrary, type Dependencies } from "./library/useLibrary.js";
import { LibrarySidebar } from "./components/LibrarySidebar.js";
import { AssetGrid } from "./components/AssetGrid.js";
import { AssetInspector } from "./components/AssetInspector.js";
import { UploadDialog } from "./components/UploadDialog.js";
import { Dialog } from "./components/Dialog.js";

export function App({ dependencies }: { dependencies?: Dependencies }) {
  const library = useLibrary(dependencies);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"grid" | "list">("grid");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectionView, setInspectionView] = useState<"sidebar" | "window">(
    "sidebar",
  );
  const categoryToggle = useRef<HTMLButtonElement>(null);
  const [dialog, setDialog] = useState<"upload" | "remove" | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const index = library.model?.index;
  const query = search.toLocaleLowerCase().trim();
  const filtered = (index?.types ?? []).filter(
    (type) =>
      (!category || type.categories.includes(category)) &&
      (!query ||
        [type.name, type.ifcClass, ...type.categories]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query)),
  );
  const selected =
    library.inspection.kind === "closed" ? "" : library.inspection.asset.id;
  const chooseModel = (id: string) => {
    setCategory("");
    setSearch("");
    library.chooseModel(id);
  };
  const remove = async () => {
    setRemoving(true);
    setRemoveError("");
    try {
      await library.hide();
      setDialog(null);
      setCategory("");
      setSearch("");
    } catch (error) {
      setRemoveError(
        error instanceof Error ? error.message : "Removal failed.",
      );
    } finally {
      setRemoving(false);
    }
  };
  return (
    <div
      className={`app ${sidebarOpen ? "sidebar-open" : ""} ${selected && inspectionView === "sidebar" ? "with-inspector" : ""}`}
    >
      <a className="skip-link" href="#catalog">
        Skip to asset types
      </a>
      <nav className="rail" aria-label="Workspace">
        <div className="brand-mark">H</div>
        <a href="#catalog" aria-label="Asset library" className="rail-active">
          <Boxes size={23} />
        </a>
        <span className="rail-label">HEMY</span>
      </nav>
      <header className="workspace-header">
        <div>
          <span className="brand-name">HEMY</span>
          <span className="header-divider" />
          <h1>Asset library</h1>
          <span className="workspace-tag">LOCAL WORKSPACE</span>
        </div>
        <button className="primary" onClick={() => setDialog("upload")}>
          <Plus size={17} />
          Add model
        </button>
      </header>
      <LibrarySidebar
        models={library.models}
        model={library.model}
        category={category}
        onCategory={(value) => {
          setCategory(value);
          setSidebarOpen(false);
          if (sidebarOpen) categoryToggle.current?.focus();
        }}
        onModel={chooseModel}
      />
      <main id="catalog" className="catalog">
        <div className="catalog-heading">
          <div className="breadcrumb">
            <FolderOpen size={15} />
            <span>Collections</span>
            <ArrowRight size={13} />
            <strong>{library.model?.name ?? "Library"}</strong>
          </div>
          <button
            className="icon-button"
            aria-label="Remove model"
            disabled={!library.model}
            onClick={() => {
              setRemoveError("");
              setDialog("remove");
            }}
          >
            <Trash2 size={17} />
          </button>
        </div>
        <div className="catalog-title">
          <div>
            <span className="eyebrow">MODEL ASSETS</span>
            <h2>{category || "All asset types"}</h2>
          </div>
          <span className="index-status">
            {index
              ? "Catalog ready"
              : library.processing.kind === "busy"
                ? "Processing"
                : "Not indexed"}
          </span>
        </div>
        <div className="toolbar">
          <button
            className="mobile-filter icon-button"
            ref={categoryToggle}
            aria-label="Toggle collections and categories"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <SlidersHorizontal size={20} />
          </button>
          <label className="search">
            <Search size={18} />
            <input
              type="search"
              aria-label="Search asset types"
              placeholder="Search asset types, categories or IFC classes"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="view-switch">
            <button
              aria-label="Grid view"
              aria-pressed={mode === "grid"}
              className={mode === "grid" ? "active" : ""}
              onClick={() => setMode("grid")}
            >
              <Grid2X2 size={18} />
            </button>
            <button
              aria-label="List view"
              aria-pressed={mode === "list"}
              className={mode === "list" ? "active" : ""}
              onClick={() => setMode("list")}
            >
              <List size={19} />
            </button>
          </div>
        </div>
        {index && (
          <div className="results-meta">
            <span>
              <strong>{filtered.length.toLocaleString()}</strong> asset types
              {category ? ` in ${category}` : ""}
            </span>
            <span>
              {index.stats.excluded.toLocaleString()} excluded ·{" "}
              {index.stats.untyped.toLocaleString()} untyped
            </span>
          </div>
        )}
        {library.processing.kind === "busy" && (
          <div className="processing" role="status">
            <LoaderCircle size={18} className="spin" />
            <span>{library.processing.message}</span>
          </div>
        )}
        {library.processing.kind === "failed" && (
          <div className="inline-message" role="alert">
            <p>{library.processing.message}</p>
            <button onClick={library.retry}>Retry processing</button>
          </div>
        )}
        {library.notice && (
          <p className="inline-message" role="status">
            {library.notice}
          </p>
        )}
        {library.inventory.kind === "busy" && (
          <div className="empty-state" role="status">
            <LoaderCircle className="spin" />
            <p>{library.inventory.message}</p>
          </div>
        )}
        {library.inventory.kind === "failed" && (
          <div className="empty-state" role="alert">
            <FolderOpen size={32} />
            <h2>Local library unavailable</h2>
            <p>{library.inventory.message}</p>
            <button onClick={() => void library.refresh()}>
              Retry connection
            </button>
          </div>
        )}
        {library.inventory.kind === "ready" && !library.models.length && (
          <div className="empty-state">
            <FolderOpen size={40} />
            <h2>Your library has no models</h2>
            <p>Add an IFC model, or check the configured source folder.</p>
            <button className="primary" onClick={() => setDialog("upload")}>
              <Plus size={16} />
              Add model
            </button>
          </div>
        )}
        {index && !filtered.length && (
          <div className="empty-state">
            <Search size={32} />
            <h2>
              {index.types.length
                ? "No matching asset types"
                : "No classified asset types"}
            </h2>
            <p>
              {index.types.length
                ? "Try another category or search term."
                : "This model has no typed elements with an eligible Generic Hard Asset classification."}
            </p>
            {index.types.length > 0 && (
              <button
                onClick={() => {
                  setSearch("");
                  setCategory("");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        )}
        {library.model && filtered.length > 0 && (
          <AssetGrid
            types={filtered}
            modelName={library.model.name}
            selectedId={selected}
            mode={mode}
            onSelect={(asset) => {
              setInspectionView("sidebar");
              library.inspect(asset);
            }}
            onExpand={(asset) => {
              setInspectionView("window");
              library.inspect(asset);
            }}
          />
        )}
        {index && (
          <footer className="catalog-footer">
            Grouped by IFC type · {index.stats.classified.toLocaleString()}{" "}
            classified occurrences · Properties are read-only
          </footer>
        )}
      </main>
      {inspectionView === "sidebar" && (
        <AssetInspector
          inspection={library.inspection}
          onClose={library.closeInspector}
          onRetry={() => {
            if (library.inspection.kind !== "closed")
              library.inspect(library.inspection.asset);
          }}
        />
      )}
      {inspectionView === "window" && library.inspection.kind !== "closed" && (
        <Dialog
          title="Asset preview"
          className="asset-preview-dialog"
          onClose={library.closeInspector}
        >
          <AssetInspector
            presentation="window"
            inspection={library.inspection}
            onClose={library.closeInspector}
            onRetry={() => {
              if (library.inspection.kind !== "closed")
                library.inspect(library.inspection.asset);
            }}
          />
        </Dialog>
      )}
      {dialog === "upload" && (
        <UploadDialog
          onClose={() => setDialog(null)}
          onUpload={async (file, progress) => {
            await library.upload(file, progress);
            setCategory("");
            setSearch("");
          }}
        />
      )}
      {dialog === "remove" && (
        <Dialog
          title="Remove model from library?"
          onClose={() => setDialog(null)}
          busy={removing}
        >
          <p>
            <strong>{library.model?.name}</strong> and its asset types will be
            hidden from this library.
          </p>
          <p>
            The original IFC file is retained. Uploaded IFC files also remain in
            local storage.
          </p>
          {removeError && (
            <p role="alert" className="error">
              {removeError}
            </p>
          )}
          <div className="dialog-actions">
            <button onClick={() => setDialog(null)} disabled={removing}>
              Cancel
            </button>
            <button
              className="danger"
              onClick={() => void remove()}
              disabled={removing}
            >
              {removing ? "Removing…" : "Remove from library"}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
