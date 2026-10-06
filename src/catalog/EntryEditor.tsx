import { useRef, useState } from "react";
import type {
  CatalogLibrary,
  EditableDefinition,
  LibraryEntry,
  NormalizedValue,
} from "../../shared/catalog-library.js";
import { entryFieldSuggestions } from "../../shared/catalog-rules.js";
import { Dialog } from "../components/Dialog.js";
import { fieldLabel, valueText } from "./display.js";
import type { CatalogAction } from "./api.js";
export function EntryEditor({
  state,
  entry,
  pending,
  onSave,
  onClose,
  error,
}: {
  state: CatalogLibrary;
  entry: LibraryEntry;
  pending: boolean;
  error: string;
  onSave(action: CatalogAction): Promise<boolean>;
  onClose(): void;
}) {
  const [definition, setDefinition] = useState<EditableDefinition>(() =>
    structuredClone(entry.definition),
  );
  const [customName, setCustomName] = useState("");
  const update = (patch: Partial<EditableDefinition>) =>
    setDefinition((d) => ({ ...d, ...patch }));
  const specify = (key: string, value: NormalizedValue) =>
    setDefinition((d) => ({
      ...d,
      specifications: { ...d.specifications, [key]: value },
    }));
  const suggestions = entryFieldSuggestions(state, entry);
  return (
    <Dialog
      title="Edit definition"
      onClose={onClose}
      busy={pending}
      className="author-dialog"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({ kind: "edit", entryId: entry.id, definition }).then(
            (ok) => {
              if (ok) onClose();
            },
          );
        }}
      >
        {error && <p role="alert">{error}</p>}
        <fieldset className="authoring-fields" disabled={pending}>
          <p>
            Saving returns this definition to Needs review. Your edits stay here
            if another staff member changes the catalog.
          </p>
          <div className="form-grid">
            <label>
              Name
              <input
                required
                value={definition.name}
                onChange={(e) => update({ name: e.target.value })}
              />
            </label>
            <label>
              Kind
              <select
                value={definition.kind}
                onChange={(e) =>
                  update({
                    kind: e.target.value === "product" ? "product" : "generic",
                  })
                }
              >
                <option value="generic">Generic specification</option>
                <option value="product">Product</option>
              </select>
            </label>
            <label>
              Category
              <select
                value={definition.categoryId ?? ""}
                onChange={(e) => update({ categoryId: e.target.value || null })}
              >
                <option value="">Choose category</option>
                {state.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Family
              <input
                value={definition.family ?? ""}
                onChange={(e) => update({ family: e.target.value || null })}
              />
            </label>
            <label className="wide">
              Description
              <textarea
                value={definition.description}
                onChange={(e) => update({ description: e.target.value })}
              />
            </label>
            <label className="wide">
              Tags, separated by commas
              <input
                value={definition.tags.join(", ")}
                onChange={(e) =>
                  update({
                    tags: e.target.value.split(",").map((s) => s.trim()),
                  })
                }
              />
            </label>
          </div>
          {(["manufacturer", "model"] as const).map((key) => (
            <fieldset key={key}>
              <legend>
                {key === "manufacturer" ? "Manufacturer" : "Model"}
              </legend>
              <input
                aria-label={key === "manufacturer" ? "Manufacturer" : "Model"}
                value={definition[key].value}
                onChange={(e) =>
                  update({ [key]: { value: e.target.value, confirmed: false } })
                }
              />
              <label className="check">
                <input
                  type="checkbox"
                  checked={definition[key].confirmed}
                  onChange={(e) =>
                    update({
                      [key]: {
                        ...definition[key],
                        confirmed: e.target.checked,
                      },
                    })
                  }
                />
                Staff confirmed {key}
              </label>
            </fieldset>
          ))}
          <h3>Curated specifications</h3>
          <p>
            Numeric source values retain their actual normalized units. Unknown
            is an explicit resolution, never zero.
          </p>
          {Object.entries(definition.specifications).map(([key, value]) => (
            <div className="spec-edit" key={key}>
              <label>
                {fieldLabel(state, key, definition.categoryId)}
                <SpecificationInput
                  value={value}
                  onChange={(next) => specify(key, next)}
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  setDefinition((d) => {
                    const specifications = { ...d.specifications };
                    delete specifications[key];
                    return { ...d, specifications };
                  })
                }
              >
                Remove override
              </button>
            </div>
          ))}
          <div className="spec-edit">
            <label>
              New specification label
              <input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={!customName.trim()}
              onClick={() => {
                specify(customName.trim(), {
                  kind: "text",
                  value: "",
                  unit: null,
                });
                setCustomName("");
              }}
            >
              Add specification
            </button>
          </div>
          <h3>Source suggestions and conflicts</h3>
          {suggestions.map((s) => (
            <section className="suggestion" key={s.key}>
              <strong>{fieldLabel(state, s.key, definition.categoryId)}</strong>
              <span className="badge">
                {s.status}
                {s.key in definition.specifications
                  ? " · resolved by override"
                  : ""}
              </span>
              <div className="action-row">
                {s.values.map((v, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Use source value ${fieldLabel(state, s.key, definition.categoryId)}: ${valueText(v)}`}
                    onClick={() => specify(s.key, v)}
                  >
                    {valueText(v)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => specify(s.key, { kind: "missing" })}
                >
                  Resolve as unknown
                </button>
              </div>
              {s.missingOccurrences.length > 0 && (
                <small>
                  {s.missingOccurrences.length} occurrences have no value.
                </small>
              )}
            </section>
          ))}
          <details>
            <summary>Unconfirmed product hints from source</summary>
            <p>These remain suggestions until entered and confirmed above.</p>
            {state.sources
              .filter((s) =>
                entry.sourceReferences.some((r) => r.sourceId === s.id),
              )
              .flatMap((s) =>
                s.observation.fields
                  .filter((f) => /manufacturer|model|product|sku/i.test(f.name))
                  .map((f) => (
                    <p key={`${s.id}:${f.key}`}>
                      {f.name}:{" "}
                      {f.values.map((v) => v.rawValue || "(blank)").join(" / ")}
                    </p>
                  )),
              )}
          </details>
          <div className="dialog-actions">
            <button type="button" onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button className="primary" disabled={pending}>
              Save definition
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}

function SpecificationInput({
  value,
  onChange,
}: {
  value: NormalizedValue;
  onChange(value: NormalizedValue): void;
}) {
  const format = useRef(value);
  if (value.kind !== "missing") format.current = value;
  const current = format.current;
  return (
    <>
      <input
        type={current.kind === "number" ? "number" : "text"}
        step="any"
        value={value.kind === "missing" ? "" : value.value}
        onChange={(event) => {
          const text = event.target.value;
          onChange(
            !text
              ? { kind: "missing" }
              : current.kind === "number"
                ? { ...current, value: Number(text) }
                : {
                    kind: "text",
                    value: text,
                    unit: current.kind === "text" ? current.unit : null,
                  },
          );
        }}
      />
      <span>{current.kind === "missing" ? "Unknown" : current.unit}</span>
    </>
  );
}
