import { useState } from "react";
import type {
  CatalogLibrary,
  EditableDefinition,
  LibraryEntry,
  NormalizedValue,
} from "../../shared/catalog-library.js";
import { Dialog } from "../components/Dialog.js";
import { AssetClassificationFields } from "./AssetClassificationFields.js";
import { entryClassifications } from "./display.js";
import type { CatalogAction } from "./api.js";

export function EntryEditor({ state, entry, pending, onSave, onClose, error }: {
  state: CatalogLibrary;
  entry: LibraryEntry;
  pending: boolean;
  error: string;
  onSave(action: CatalogAction): Promise<boolean>;
  onClose(): void;
}) {
  const [draft, setDraft] = useState<{
    definition: EditableDefinition;
    ifcClass: string;
    system: string;
  }>(() => ({
    definition: structuredClone(entry.definition),
    ...entryClassifications(state, entry),
  }));
  const classify = (field: "ifcClass" | "system", value: string) => {
    const key = field === "ifcClass" ? "IFC Class" : "System";
    const specification: NormalizedValue = value
      ? { kind: "text", value, unit: null }
      : { kind: "missing" };
    setDraft(previous => ({
      ...previous,
      [field]: value,
      definition: {
        ...previous.definition,
        specifications: { ...previous.definition.specifications, [key]: specification },
      },
    }));
  };
  return <Dialog title="Edit definition" onClose={onClose} busy={pending} className="author-dialog">
    <form onSubmit={event => {
      event.preventDefault();
      if (pending || !draft.definition.name.trim()) return;
      void onSave({ kind: "edit", entryId: entry.id,
        definition: { ...draft.definition, name: draft.definition.name.trim() },
      }).then(ok => { if (ok) onClose(); });
    }}>
      {error && <p role="alert">{error}</p>}
      <fieldset className="authoring-fields" disabled={pending}>
        <label>Asset name
          <input required aria-label="Asset name" value={draft.definition.name}
            onChange={event => {
              const name = event.target.value;
              setDraft(previous => ({ ...previous, definition: { ...previous.definition, name } }));
            }} />
        </label>
        <AssetClassificationFields ifcClass={draft.ifcClass} system={draft.system}
          onIfcClass={value => classify("ifcClass", value)} onSystem={value => classify("system", value)} />
        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={pending}>Cancel</button>
          <button className="primary" disabled={pending || !draft.definition.name.trim()}>Save definition</button>
        </div>
      </fieldset>
    </form>
  </Dialog>;
}
