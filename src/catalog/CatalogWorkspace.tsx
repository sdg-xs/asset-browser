import { useEffect, useMemo, useState } from "react";
import { loadAssetViewer } from "../viewer/load-viewer.js";
import { Boxes, FileUp, Grid2X2, List, Search } from "lucide-react";
import { entryIssues } from "../../shared/catalog-rules.js";
import { AssetCreationDialog } from "./AssetCreationDialog.js";
import type { CreationWorker } from "./useAssetCreation.js";
import { useSourceAvailability } from "./useSourceAvailability.js";
import { IfcWorkerClient } from "../ifc/client.js";
import { libraryApi, type LibraryApi } from "../library/api.js";
import type { LibraryWorker } from "../library/useLibrary.js";
import type { ViewerLoader } from "../components/AssetInspector.js";
import { SourceWorkspace } from "../components/SourceWorkspace.js";
import { Dialog } from "../components/Dialog.js";
import { catalogApi as defaultCatalogApi, type CatalogApi } from "./api.js";
import { useCatalogLibrary } from "./useCatalogLibrary.js";
import { useSourceAnalysis, type AnalysisWorker } from "./useSourceAnalysis.js";
import { CatalogSidebar, type Workspace } from "./CatalogSidebar.js";
import { DefinitionCards } from "./DefinitionCards.js";
import { DefinitionInspector } from "./DefinitionInspector.js";
import { EntryEditor } from "./EntryEditor.js";
import { CategoryEditor } from "./CategoryEditor.js";
import { ReviewDialog } from "./ReviewDialog.js";
import { entryFieldLabel, entrySpecifications, valueText } from "./display.js";
const createDefaultWorker = () => new IfcWorkerClient();
export interface CatalogWorkspaceProps {
  catalogApi?: CatalogApi;
  sourceApi?: LibraryApi;
  createWorker?: () => LibraryWorker;
  createAnalysisWorker?: () => AnalysisWorker;
  createCreationWorker?: () => CreationWorker;
  loadViewer?: ViewerLoader;
}
export function CatalogWorkspace({
  catalogApi = defaultCatalogApi,
  sourceApi = libraryApi,
  createWorker = createDefaultWorker,
  createAnalysisWorker = createDefaultWorker,
  createCreationWorker = createDefaultWorker,
  loadViewer = loadAssetViewer,
}: CatalogWorkspaceProps) {
  const catalog = useCatalogLibrary(catalogApi);
  const state = catalog.state;
  const [workspace, setWorkspace] = useState<Workspace>("Library"),
    [category, setCategory] = useState(""),
    [search, setSearch] = useState(""),
    [source, setSource] = useState(""),
    [kind, setKind] = useState("");
  const [mode, setMode] = useState<"grid" | "list">("grid"),
    [archived, setArchived] = useState(false),
    [selected, setSelected] = useState(""),
    [modal, setModal] = useState(false),
    [checked, setChecked] = useState<string[]>([]),
    [editor, setEditor] = useState<
      "edit" | "merge" | "split" | "geometry" | null
    >(null);
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [creationNotice, setCreationNotice] = useState("");
  const [batchNotice, setBatchNotice] = useState("");
  const [skippedApprovals, setSkippedApprovals] = useState<string[]>([]);
  const { availability, retry: retryAvailability } = useSourceAvailability(
    sourceApi,
    workspace,
    state?.revision,
  );
  const dependencies = useMemo(
    () => ({ api: sourceApi, createWorker }),
    [sourceApi, createWorker],
  );
  const analysis = useSourceAnalysis(
    createAnalysisWorker,
    sourceApi,
    (snapshot) => catalog.execute({ kind: "import", snapshot }),
  );
  const query = search.toLocaleLowerCase().trim();
  const entries = useMemo(
    () =>
      state?.entries.filter(
        (e) =>
          (workspace === "Needs review"
            ? archived
              ? e.status === "archived"
              : e.status === "draft" ||
                (e.status === "approved" && e.reviewFlags.length > 0)
            : e.status === "approved") &&
          (!category || e.definition.categoryId === category) &&
          (!kind || e.definition.kind === kind) &&
          (!source ||
            e.sourceReferences.some((r) =>
              state.sources.some(
                (s) => s.id === r.sourceId && s.modelId === source,
              ),
            )) &&
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
    [state, workspace, archived, category, kind, source, query],
  );
  useEffect(
    () => setPage(0),
    [workspace, archived, category, kind, source, query],
  );
  const pageCount = Math.max(1, Math.ceil(entries.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleEntries = entries.slice(
    currentPage * 50,
    (currentPage + 1) * 50,
  );
  const visibleIds = visibleEntries.map((e) => e.id).join("|");
  useEffect(() => {
    setChecked([]);
  }, [visibleIds, state?.revision, workspace]);
  const entry = state?.entries.find((e) => e.id === selected);
  const approvalSelection = useMemo(() => {
    const ids = new Set(checked);
    const ready: string[] = [];
    const skipped: string[] = [];
    if (!state) return { ready, skipped };
    for (const item of state.entries) {
      if (!ids.has(item.id)) continue;
      const issues = entryIssues(state, item);
      if (issues.length) skipped.push(`${item.definition.name}: ${issues.map(issue =>
        issue.startsWith("Unresolved source conflict: ")
          ? `Resolve conflicting ${entryFieldLabel(state, item, issue.slice("Unresolved source conflict: ".length))} values.`
          : issue,
      ).join(" ")}`);
      else ready.push(item.id);
    }
    return { ready, skipped };
  }, [state, checked]);
  const displayedSkipped = checked.length ? approvalSelection.skipped : skippedApprovals;
  const approveSelected = async () => {
    const selectedCount = checked.length;
    setSkippedApprovals(approvalSelection.skipped);
    if (!approvalSelection.ready.length) {
      setBatchNotice(`None of the ${selectedCount} selected definitions are ready. Edit the drafts to resolve the issues below.`);
      return;
    }
    setBatchNotice("");
    const saved = await catalog.execute({ kind: "approve", entryIds: approvalSelection.ready });
    if (saved) setBatchNotice(`Approved ${approvalSelection.ready.length} of ${selectedCount} selected definitions. ${approvalSelection.skipped.length} stayed in Needs review.`);
    else setSkippedApprovals([]);
  };
  const navigate = (value: Workspace) => {
    analysis.cancel();
    setWorkspace(value);
    setSelected("");
    setEditor(null);
    setCategory("");
    setSearch("");
    setSource("");
    setKind("");
    setBatchNotice("");
    setSkippedApprovals([]);
  };
  const inspect =
    entry && state ? (
      <DefinitionInspector
        state={state}
        entry={entry}
        sourceApi={sourceApi}
        createWorker={createWorker}
        loadViewer={loadViewer}
        pending={catalog.pending}
        modal={modal}
        reviewMode={workspace === "Needs review"}
        error={catalog.error}
        onClose={() => setSelected("")}
        onEdit={() => setEditor("edit")}
        onCategories={() => navigate("Categories")}
        onReview={setEditor}
        onAction={(action) =>
          void catalog
            .execute({ kind: action, entryIds: [entry.id] })
            .then((ok) => {
              if (ok) setSelected("");
            })
        }
      />
    ) : null;
  return (
    <div className={`curated-app ${entry && !modal ? "has-definition" : ""}`}>
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
          <span className="brand-name">HEMY</span>
          <span className="header-divider" />
          <h1>Asset library</h1>
          <span className="workspace-tag">CURATED COLLECTION</span>
        </div>
        <span className="workspace-tag">LOCAL WORKSPACE</span>
      </header>
      <CatalogSidebar
        state={state}
        workspace={workspace}
        onWorkspace={navigate}
        category={category}
        onCategory={setCategory}
      />
      <main id="library-content" className="curated-content">
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
        {workspace === "Sources" ? (
          <>
            {analysis.error && <p role="alert">{analysis.error}</p>}
            {analysis.notice && <p role="status">{analysis.notice}</p>}
            <SourceWorkspace
              dependencies={dependencies}
              embedded
              onImport={analysis.analyze}
              importProgress={analysis.progress}
              importSaving={analysis.saving}
              onCancelImport={analysis.cancel}
            />
          </>
        ) : workspace === "Categories" ? (
          state && (
            <CategoryEditor
              state={state}
              pending={catalog.pending}
              onSave={catalog.execute}
            />
          )
        ) : (
          <>
            <div className="catalog-title">
              <div>
                <span className="eyebrow">
                  {workspace === "Library"
                    ? "REUSABLE ASSET DEFINITIONS"
                    : "STAFF REVIEW"}
                </span>
                <h2>
                  {category
                    ? state?.categories.find((c) => c.id === category)?.name
                    : workspace === "Library"
                      ? "Your asset library"
                      : "Needs review"}
                </h2>
                <p>
                  {workspace === "Library"
                    ? "Approved products and specification variants, across all sources."
                    : "Resolve specifications, compare variants and approve ready definitions."}
                </p>
              </div>
              <div className="catalog-title-actions">
                <span className="count-token">{entries.length}</span>
                {workspace === "Library" && <button
                  className="primary"
                  disabled={!state || catalog.pending}
                  onClick={() => { setCreationNotice(""); setCreating(true); }}
                >
                  <FileUp size={18} aria-hidden="true" /> Upload IFC
                </button>}
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
            <div className="catalog-filters">
              <label>
                Source
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <option value="">All sources</option>
                  {[
                    ...new Map(
                      state?.sources.map((s) => [s.modelId, s.sourceName]) ??
                        [],
                    ).entries(),
                  ].map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Definition kind
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="">All kinds</option>
                  <option value="generic">Generic specification</option>
                  <option value="product">Product</option>
                </select>
              </label>
              {workspace === "Needs review" && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={archived}
                    onChange={(e) => {
                      setArchived(e.target.checked);
                      setSelected("");
                    }}
                  />
                  Show archived
                </label>
              )}
            </div>
            {workspace === "Needs review" && entries.length > 0 && (
              <div className="batch-bar">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={checked.length === visibleEntries.length}
                    onChange={(e) =>
                      setChecked(
                        e.target.checked
                          ? visibleEntries.map((item) => item.id)
                          : [],
                      )
                    }
                  />
                  Select all {visibleEntries.length} visible definitions
                </label>
                <button
                  disabled={!checked.length || catalog.pending}
                  onClick={() => archived ? void catalog.execute({ kind: "restore", entryIds: checked }) : void approveSelected()}
                >
                  {archived ? "Restore selected" : "Approve selected"} (
                  {checked.length})
                </button>
                {!archived && checked.length > 0 && <span role="status">{approvalSelection.ready.length} ready of {checked.length} selected; {approvalSelection.skipped.length} needs attention.</span>}
              </div>
            )}
            {workspace === "Needs review" && !archived && <>
              {batchNotice && <p role={batchNotice.startsWith("None") ? "alert" : "status"} className="inline-message">{batchNotice}</p>}
              {displayedSkipped.length > 0 && <div className="batch-skipped"><p>These definitions need attention before approval:</p><ul>{displayedSkipped.map((reason, index) => <li key={`${index}:${reason}`}>{reason}</li>)}</ul></div>}
            </>}
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
            {state && entries.length > 0 && (
              <DefinitionCards
                state={state}
                entries={visibleEntries}
                availability={availability}
                selected={selected}
                checked={checked}
                mode={mode}
                review={workspace === "Needs review"}
                onCheck={(id) =>
                  setChecked((all) =>
                    all.includes(id)
                      ? all.filter((v) => v !== id)
                      : [...all, id],
                  )
                }
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
                  {workspace === "Library" &&
                  !state.entries.some((e) => e.status === "approved")
                    ? "Your approved library starts here"
                    : "No matching definitions"}
                </h2>
                <p>
                  Upload an IFC file, choose reusable assets, then review and approve the drafts.
                </p>
                <div className="action-row">
                  <button
                    className="primary"
                    disabled={catalog.pending}
                    onClick={() => { setCreationNotice(""); setCreating(true); }}
                  >
                    Upload IFC
                  </button>
                  <button onClick={() => navigate("Needs review")}>
                    Review drafts
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
      {creating && state && <AssetCreationDialog
        sourceApi={sourceApi}
        revision={state.revision}
        execute={catalog.execute}
        createWorker={createCreationWorker}
        onClose={submitted => {
          setCreating(false);
          if (submitted) setCreationNotice("Draft creation was submitted and may still finish. Check Needs review for the saved drafts.");
        }}
        onSuccess={() => {
          setCreating(false);
          navigate("Needs review");
          setArchived(false);
          setCreationNotice("Selected drafts saved. Review their name, classification and specifications before approval.");
        }}
      />}
      {!modal && inspect}
      {modal && entry && (
        <Dialog
          title="Definition preview"
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
          onCategories={() => { setEditor(null); navigate("Categories"); }}
        />
      )}{" "}
      {entry && state && editor && editor !== "edit" && (
        <ReviewDialog
          error={catalog.error}
          key={`${entry.id}:${editor}`}
          mode={editor}
          state={state}
          entry={entry}
          pending={catalog.pending}
          onSave={catalog.execute}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
