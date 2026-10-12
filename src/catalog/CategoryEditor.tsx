import { useMemo, useState } from "react";
import { ArrowUpRight, Plus } from "lucide-react";
import { AssetClassificationFields } from "./AssetClassificationFields.js";
import { Dialog } from "../components/Dialog.js";
import { ifcClassLabel } from "../../shared/ifc-class-snapshot.js";
import type {
  CatalogLibrary,
  CatalogCategory,
} from "../../shared/catalog-library.js";
import type { CatalogAction } from "./api.js";
export function CategoryEditor({
  state,
  pending,
  onSave,
  error,
}: {
  state: CatalogLibrary;
  pending: boolean;
  onSave(action: CatalogAction): Promise<boolean>;
  error: string;
}) {
  const [dialog, setDialog] = useState<{ kind: "create" } | { kind: "edit"; id: string } | null>(null);
  const [query, setQuery] = useState("");
  const rows = useMemo(() => [...state.categories]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    .map(category => ({ category, ifcClass: category.ifcClass || "—", system: category.system || "—" })), [state.categories]);
  const search = query.trim().toLocaleLowerCase();
  const visibleRows = rows.filter(({ category }) =>
    [category.name, category.ifcClass ?? "", category.system ?? ""].some(value => value.toLocaleLowerCase().includes(search)));
  const selectedRow = dialog?.kind === "edit" ? rows.find(row => row.category.id === dialog.id) : undefined;
  const category = selectedRow?.category;
  return (
    <section className="category-author">
      <div className="catalog-title">
        <div>
          <span className="eyebrow">GENERIC HARD ASSETS</span>
          <h2>Manage Categories</h2>
          <p>Create a category and assign its IFC Class and System before adding assets.</p>
        </div>
        <div className="catalog-title-actions">
          <span className="count-token">{search ? `${visibleRows.length} / ${rows.length}` : rows.length}</span>
          <button className="primary" disabled={pending} onClick={() => setDialog({ kind: "create" })}>
            <Plus size={18} aria-hidden="true" /> Add category
          </button>
        </div>
      </div>
      <label className="category-list-search">Search categories
        <input type="search" placeholder="Search category name, IFC Class or System…" value={query}
          onChange={event => setQuery(event.target.value)} />
      </label>
      <div className="category-table-scroll" role="region" aria-label="Category list" tabIndex={0}>
        <table className="category-table" aria-label="Generic Hard Asset categories">
          <thead><tr><th scope="col">Generic Hard Asset</th><th scope="col">IFC Class</th><th scope="col">System</th></tr></thead>
          <tbody>
            {visibleRows.map(({ category, ifcClass, system }) => <tr key={category.id}>
              <th scope="row"><div className="category-table-name">
                <button className="category-details-button" aria-label={`Open ${category.name} category`} disabled={pending}
                  onClick={() => setDialog({ kind: "edit", id: category.id })}>
                  <ArrowUpRight size={18} aria-hidden="true" />
                </button>
                <span>{category.name}</span>
              </div></th>
              <td>{ifcClassLabel(ifcClass)}</td><td>{system}</td>
            </tr>)}
            {!visibleRows.length && <tr><td colSpan={3} className="category-table-empty">{search ? "No categories match your search." : "No categories yet. Add a category to get started."}</td></tr>}
          </tbody>
        </table>
      </div>
      {dialog && (dialog.kind === "create" || category) && <Dialog title={category ? `${category.name} category` : "Add category"}
        onClose={() => setDialog(null)} busy={pending} className="category-editor-dialog">
        <CategoryForm key={dialog.kind === "edit" ? dialog.id : "new"} category={category} state={state}
          pending={pending} onSave={onSave} error={error}
          initialIfcClass={selectedRow?.ifcClass === "—" ? "" : selectedRow?.ifcClass ?? ""}
          initialSystem={selectedRow?.system === "—" ? "" : selectedRow?.system ?? ""} />
      </Dialog>}
    </section>
  );
}
function CategoryForm({
  category,
  state,
  pending,
  onSave,
  error,
  initialIfcClass,
  initialSystem,
}: {
  category: CatalogCategory | undefined;
  state: CatalogLibrary;
  pending: boolean;
  onSave(action: CatalogAction): Promise<boolean>;
  error: string;
  initialIfcClass: string;
  initialSystem: string;
}) {
  const [id] = useState(() => category?.id ?? crypto.randomUUID());
  const [name, setName] = useState(category?.name ?? "");
  const [ifcClass, setIfcClass] = useState(initialIfcClass);
  const [system, setSystem] = useState(initialSystem);
  const [notice, setNotice] = useState("");
  const savedCategory = state.categories.find(category => category.id === id);
  return <fieldset className="category-fields" disabled={pending}>
    <form className="category-form" onSubmit={event => {
      event.preventDefault();
      setNotice("");
      void onSave({ kind: "category", id, name, ifcClass, system, aliases: savedCategory?.aliases ?? [] }).then(ok => {
        if (ok) {
          setName(name.trim());
          setIfcClass(ifcClass.trim());
          setSystem(system.trim());
          setNotice("Category saved.");
        }
      });
    }}>
      <label>Category name
        <input required value={name} onChange={event => setName(event.target.value)} />
      </label>
      <AssetClassificationFields ifcClass={ifcClass} system={system} onIfcClass={setIfcClass} onSystem={setSystem} />
      <button className="primary" disabled={pending || !name.trim()}>Save category</button>
    </form>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </fieldset>;
}
