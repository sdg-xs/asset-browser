import { useEffect, useMemo, useState } from "react";
import { loadAssetViewer } from "../viewer/load-viewer.js";
import { Boxes, FileUp, Grid2X2, List, Search } from "lucide-react";
import { AssetCreationDialog } from "./AssetCreationDialog.js";
import type { CreationWorker } from "./useAssetCreation.js";
import { useSourceAvailability } from "./useSourceAvailability.js";
import { IfcWorkerClient } from "../ifc/client.js";
import { libraryApi, type LibraryApi } from "../library/api.js";
import type { LibraryWorker } from "../library/useLibrary.js";
import type { ViewerLoader } from "../components/AssetInspector.js";
import { Dialog } from "../components/Dialog.js";
import { Brand } from "../components/Brand.js";
import { catalogApi as defaultCatalogApi, type CatalogApi } from "./api.js";
import { useCatalogLibrary } from "./useCatalogLibrary.js";
import { CatalogSidebar, CatalogTabs } from "./CatalogSidebar.js";
import { DefinitionCards } from "./DefinitionCards.js";
import { DefinitionInspector } from "./DefinitionInspector.js";
import { EntryEditor } from "./EntryEditor.js";
import { CategoryEditor } from "./CategoryEditor.js";
import { UpdateGeometryDialog } from "./UpdateGeometryDialog.js";
import { geometryApi as defaultGeometryApi, type GeometryApi } from "./geometry-api.js";
import { entrySpecifications, valueText } from "./display.js";
import { definitionGroups } from "./definition-groups.js";
const createDefaultWorker = () => new IfcWorkerClient();
export interface CatalogWorkspaceProps {
  catalogApi?: CatalogApi;
  sourceApi?: LibraryApi;
  meshApi?: GeometryApi;
  createWorker?: () => LibraryWorker;
  createCreationWorker?: () => CreationWorker;
  loadViewer?: ViewerLoader;
}
export function CatalogWorkspace({
  catalogApi = defaultCatalogApi,
  sourceApi = libraryApi,
  meshApi = defaultGeometryApi,
  createWorker = createDefaultWorker,
  createCreationWorker = createDefaultWorker,
  loadViewer = loadAssetViewer,
}: CatalogWorkspaceProps) {
  const catalog = useCatalogLibrary(catalogApi);
  const state = catalog.state;
  const [selectedCategories, setSelectedCategories] = useState<string[] | null>(null),
    [search, setSearch] = useState("");
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [mode, setMode] = useState<"grid" | "list">("grid"),
    [selected, setSelected] = useState(""),
    [modal, setModal] = useState(false),
    [editor, setEditor] = useState<
      "edit" | "geometry" | null
    >(null);
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [geometryFiles, setGeometryFiles] = useState<File[] | null>(null);
  const [creationNotice, setCreationNotice] = useState("");
  const { availability, retry: retryAvailability } = useSourceAvailability(
    sourceApi,
    "Library",
    state?.revision,
  );
  const query = search.toLocaleLowerCase().trim();
  const filteredEntries = useMemo(
    () =>
      state?.entries.filter(
        (e) =>
          e.status !== "archived" &&
          (selectedCategories === null || (e.definition.categoryId !== null && selectedCategories.includes(e.definition.categoryId))) &&
          (!query ||
            [
              e.definition.name,
              e.definition.description,
              e.definition.manufacturer.value,
              e.definition.model.value,
              ...e.definition.tags,
              state.categories.find((c) => c.id === e.definition.categoryId)
                ?.name ?? "",
              ...Object.values(entrySpecifications(state, e)).map(valueText),
            ]
              .join(" ")
              .toLocaleLowerCase()
              .includes(query)),
      ) ?? [],
    [state, selectedCategories, query],
  );
  const groups = useMemo(() => definitionGroups(filteredEntries), [filteredEntries]);
  const entries = filteredEntries.filter(entry => groups.has(entry.id));
  useEffect(
    () => setPage(0),
    [selectedCategories, query],
  );
  const pageCount = Math.max(1, Math.ceil(entries.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleEntries = entries.slice(
    currentPage * 50,
    (currentPage + 1) * 50,
  );
  const entry = state?.entries.find((e) => e.id === selected);
  const selectedGroup = [...groups.values()].find(members => members.some(member => member.id === selected)) ?? [];
  const selectedCardId = selectedGroup[0]?.id ?? selected;
  const navigate = () => {
    retryAvailability();
    setCategoriesOpen(false);
    setSelected("");
    setEditor(null);
    setSelectedCategories(null);
    setSearch("");
  };
  const inspect =
    entry && state && !categoriesOpen ? (
      <DefinitionInspector
        state={state}
        entry={entry}
        sourceApi={sourceApi}
        meshApi={meshApi}
        createWorker={createWorker}
        loadViewer={loadViewer}
        pending={catalog.pending}
        modal={modal}
        error={catalog.error}
        onClose={() => setSelected("")}
        onEdit={() => setEditor("edit")}
        onGeometry={() => setEditor("geometry")}
      />
    ) : null;
  return (
    <div className={`curated-app ${entry && !modal && !categoriesOpen ? "has-definition" : ""}`}>
      <a className="skip-link" href="#library-content">
        Skip to library
      </a>
      <div className="rail curated-rail">
        <div className="brand-mark">H</div>
        <Boxes size={25} />
        <span className="rail-label">HEMY</span>
      </div>
      <header className="workspace-header">
        <div>
          <Brand />
          <span className="header-divider" />
          <h1>Asset library</h1>
          <span className="workspace-tag">CURATED COLLECTION</span>
        </div>
        <span className="workspace-tag">LOCAL WORKSPACE</span>
      </header>
      <main id="library-content" className="curated-content">
        <CatalogTabs onLibrary={navigate}
          categoriesOpen={categoriesOpen} onCategories={() => setCategoriesOpen(true)} />
        <div className={`catalog-tab-content ${categoriesOpen ? "managing-categories" : ""}`} role="region" aria-label="Library content">
      {!categoriesOpen && <CatalogSidebar
        state={state}
        selectedCategories={selectedCategories}
        onCategoriesFilter={setSelectedCategories}
        categoriesOpen={categoriesOpen}
      />}
        <div className="catalog-browse-content">
        {availability.kind === "failed" && (
          <div className="inline-message" role="alert">
            Source availability could not be checked: {availability.message}
            <button onClick={retryAvailability}>
              Retry source availability
            </button>
          </div>
        )}
        {catalog.error && (
          <div className="inline-message" role="alert">
            {catalog.error}
            <button onClick={() => void catalog.refresh()}>
              Refresh catalog
            </button>
          </div>
        )}
        {catalog.pending && <p role="status">Saving catalog…</p>}
        {creationNotice && <p role="status" className="inline-message">{creationNotice}</p>}
        {!state && !catalog.error && <p role="status">Loading catalog…</p>}
        {categoriesOpen && state && (
          <section id="category-management" className="category-management" aria-label="Category settings">
            <CategoryEditor state={state} pending={catalog.pending} onSave={catalog.execute} error={catalog.error} />
          </section>
        )}
        {!categoriesOpen && <>
            <div className="catalog-title">
              <div>
                <span className="eyebrow">
                  REUSABLE ASSET DEFINITIONS
                </span>
                <h2>
                  {selectedCategories?.length === 0
                    ? "No categories selected"
                    : selectedCategories?.length === 1
                    ? state?.categories.find((c) => c.id === selectedCategories[0])?.name
                    : selectedCategories && selectedCategories.length > 1
                      ? `${selectedCategories.length} categories selected`
                    : "Your asset library"}
                </h2>
                <p>
                  Reusable assets with geometry and metadata.
                </p>
              </div>
              <div className="catalog-title-actions">
                <span className="count-token">{entries.length}</span>
                <button
                  className="primary"
                  disabled={!state || catalog.pending}
                  onClick={() => { setCreationNotice(""); setCreating(true); }}
                >
                  <FileUp size={18} aria-hidden="true" /> Create asset
                </button>
              </div>
            </div>
            <div className="toolbar">
              <label className="search">
                <Search size={18} />
                <input
                  type="search"
                  aria-label="Search definitions"
                  placeholder="Search definitions and specifications"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <div className="view-switch">
                <button
                  aria-label="Grid view"
                  aria-pressed={mode === "grid"}
                  onClick={() => setMode("grid")}
                >
                  <Grid2X2 size={18} />
                </button>
                <button
                  aria-label="List view"
                  aria-pressed={mode === "list"}
                  onClick={() => setMode("list")}
                >
                  <List size={18} />
                </button>
              </div>
            </div>
            {state && entries.length > 0 && (
              <nav className="catalog-pagination" aria-label="Definition pages">
                <span role="status">
                  {currentPage * 50 + 1}–
                  {Math.min((currentPage + 1) * 50, entries.length)} of{" "}
                  {entries.length} definitions · Page {currentPage + 1} of{" "}
                  {pageCount}
                </span>
                <button
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous page
                </button>
                <button
                  disabled={currentPage + 1 >= pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next page
                </button>
              </nav>
            )}
            <div className="definition-results" role="region" aria-label="Asset list" tabIndex={0}>
            {state && entries.length > 0 && (
              <DefinitionCards
                state={state}
                entries={visibleEntries}
                availability={availability}
                selected={selectedCardId}
                mode={mode}
                onSelect={(id, expanded) => {
                  setSelected(id);
                  setModal(expanded);
                }}
              />
            )}
            {state && !entries.length && (
              <div className="empty-state">
                <Boxes size={44} strokeWidth={1} />
                <h2>
                  {!state.entries.some((e) => e.status !== "archived")
                    ? "Your asset library starts here"
                    : "No matching definitions"}
                </h2>
                <p>
                  Upload a 3D model, fill in the asset details, then save it to your library.
                </p>
                <div className="action-row">
                  <button
                    className="primary"
                    disabled={catalog.pending}
                    onClick={() => { setCreationNotice(""); setCreating(true); }}
                  >
                    Create asset
                  </button>
                </div>
              </div>
            )}
            </div>
        </>}
        </div>
        </div>
      </main>
      {creating && state && <AssetCreationDialog
        categories={state.categories}
        onGeometryFiles={files => { setCreating(false); setGeometryFiles(files); }}
        sourceApi={sourceApi}
        revision={state.revision}
        execute={catalog.execute}
        createWorker={createCreationWorker}
        loadViewer={loadViewer}
        onClose={submitted => {
          setCreating(false);
          if (submitted) setCreationNotice("Asset creation was submitted and may still finish. Check Library for the saved asset.");
        }}
        onSuccess={() => {
          setCreating(false);
          navigate();
          setCreationNotice("Asset saved to your library.");
        }}
      />}
      {geometryFiles && state && <UpdateGeometryDialog initialFiles={geometryFiles} categories={state.categories} sourceApi={sourceApi} meshApi={meshApi}
        createWorker={createWorker} createDetailsWorker={createCreationWorker} loadViewer={loadViewer} pending={catalog.pending} error={catalog.error}
        onClose={() => setGeometryFiles(null)} onSave={async action => {
          const saved = await catalog.execute(action);
          if (saved) { navigate(); setCreationNotice("Asset saved to your library."); }
          return saved;
        }} />}
      {!modal && inspect}
      {modal && entry && !categoriesOpen && (
        <Dialog
          title="Definition preview"
          hideTitle
          onClose={() => setSelected("")}
          className="definition-preview-dialog"
        >
          {inspect}
        </Dialog>
      )}
      {entry && state && editor === "edit" && (
        <EntryEditor
          error={catalog.error}
          key={entry.id}
          state={state}
          entry={entry}
          pending={catalog.pending}
          onSave={catalog.execute}
          onClose={() => setEditor(null)}
          onCategories={() => { setEditor(null); setCategoriesOpen(true); }}
        />
      )}{" "}
      {entry && editor === "geometry" && (
        <UpdateGeometryDialog entry={entry} sourceApi={sourceApi} meshApi={meshApi} createWorker={createWorker} loadViewer={loadViewer}
          pending={catalog.pending} error={catalog.error} onSave={catalog.execute} onClose={() => setEditor(null)} />
      )}
    </div>
  );
}
