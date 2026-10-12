import { useState } from "react";
import { ifcClassLabel } from "../../shared/ifc-class-snapshot.js";
import { assetUploadDetailsSchema, type AssetUploadDetails, type CatalogCategory, type SourceTypeObservation } from "../../shared/catalog-library.js";
import { SearchableSelect } from "../components/SearchableSelect.js";

export function UploadAssetDetails({ name, source, categories = [], pending, onSubmit }: {
  name: string;
  source: SourceTypeObservation | null;
  occurrenceId: number | null;
  categories?: CatalogCategory[];
  pending: boolean;
  onSubmit(details: AssetUploadDetails): void;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [details, setDetails] = useState<AssetUploadDetails>(() => ({
    name: source?.name ?? name,
    ifcClass: categories.length > 0 ? "" : source?.ifcClass ?? "",
    system: "",
    fdvuDocumentationUrl: "",
  }));
  const categoryRequired = categories.length > 0 && !categoryId;
  const validation = assetUploadDetailsSchema.safeParse({ ...details, ...(categoryId ? { categoryId } : {}) });
  return <form className="upload-asset-details" onSubmit={event => {
    event.preventDefault();
    if (!categoryRequired && validation.success) onSubmit(validation.data);
  }}>
    <div className="upload-details-heading"><h3>Asset details</h3><span>Fill in before saving</span></div>
    <p>Select a category to fill IFC Class and System automatically, then enter the asset name. Change classifications in Manage Categories.</p>
    {categories.length > 0 && <div className="upload-category classification-field"><span>Category</span>
      <SearchableSelect label="Asset category" placeholder="Search categories…" emptyLabel="Select category" noMatchesMessage="No matching categories."
        disabled={pending} value={categoryId}
        options={[...categories].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
          .map(category => ({ value: category.id, label: category.name, description: "" }))}
        onChange={id => {
      const category = categories.find(category => category.id === id);
      setCategoryId(id);
      setDetails(previous => ({ ...previous,
        ifcClass: category?.ifcClass ?? "",
        system: category?.system ?? "",
      }));
    }} /></div>}
    <fieldset disabled={pending} className="authoring-fields">
      <label>Asset name<input required aria-label="Asset name" value={details.name}
        onChange={event => setDetails(previous => ({ ...previous, name: event.target.value }))} /></label>
      <label>IFC Class<input aria-label="IFC Class" value={ifcClassLabel(details.ifcClass)} readOnly placeholder="Assigned by category" /></label>
      <label>System<input aria-label="System" value={details.system} readOnly placeholder="Assigned by category" /></label>
      {!validation.success && <p role="alert">{validation.error.issues[0]?.message}</p>}
      {categoryRequired && <p>Choose a category before saving.</p>}
      <button className="primary" disabled={!validation.success || pending || categoryRequired}>Save asset</button>
    </fieldset>
  </form>;
}
