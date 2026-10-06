import { useEffect, useState } from "react";
import type {
  CatalogLibrary,
  CatalogCategory,
  FieldMapping,
} from "../../shared/catalog-library.js";
import type { CatalogAction } from "./api.js";
import {
  reusableField,
  parameterSourceKeys,
} from "../../shared/catalog-observations.js";
export function CategoryEditor({
  state,
  pending,
  onSave,
}: {
  state: CatalogLibrary;
  pending: boolean;
  onSave(action: CatalogAction): Promise<boolean>;
}) {
  const [selected, setSelected] = useState("");
  const category = state.categories.find((c) => c.id === selected);
  return (
    <section className="category-author">
      <div className="catalog-title">
        <div>
          <span className="eyebrow">AUTHORING</span>
          <h2>Categories & specifications</h2>
        </div>
      </div>
      <p>
        Unify source labels with aliases, then confirm which properties describe
        reusable variants.
      </p>
      <label>
        Category to edit
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Create category</option>
          {state.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <CategoryForm
        key={selected}
        category={category}
        state={state}
        pending={pending}
        onSave={onSave}
      />
    </section>
  );
}
function CategoryForm({
  category,
  state,
  pending,
  onSave,
}: {
  category: CatalogCategory | undefined;
  state: CatalogLibrary;
  pending: boolean;
  onSave(action: CatalogAction): Promise<boolean>;
}) {
  const [id] = useState(() => category?.id ?? crypto.randomUUID());
  const [name, setName] = useState(category?.name ?? "");
  const [aliases, setAliases] = useState(category?.aliases.join(", ") ?? "");
  const template = state.templates.find((t) => t.categoryId === id);
  const [mappings, setMappings] = useState<FieldMapping[]>(() =>
    structuredClone(template?.mappings ?? []),
  );
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [reconcile, setReconcile] = useState<number | null>(null);
  useEffect(() => {
    if (reconcile === null || state.revision <= reconcile) return;
    const saved = state.categories.find((c) => c.id === id);
    if (saved) {
      setName(saved.name);
      setAliases(saved.aliases.join(", "));
      setReconcile(null);
      setNotice("Category and aliases saved.");
    }
  }, [state, id, reconcile]);
  const suggestions = (template?.suggestions ?? []).filter(
    (s) =>
      reusableField({ name: s.label }, state.excludedSourceParameterNames) &&
      !mappings.some((m) =>
        parameterSourceKeys(s).some((key) =>
          parameterSourceKeys(m).includes(key),
        ),
      ),
  );
  const savedCategory = state.categories.find((c) => c.id === id);
  const observed = state.sources
    .filter((s) =>
      s.observation.categories.some(
        (label) =>
          label === savedCategory?.name ||
          savedCategory?.aliases.includes(label),
      ),
    )
    .flatMap((s) => s.observation.fields)
    .filter((field) => reusableField(field, state.excludedSourceParameterNames));
  const saveTemplate = async () => {
    setError("");
    for (const mapping of mappings) {
      const units = new Set(
        observed
          .filter((f) => parameterSourceKeys(mapping).includes(f.key))
          .flatMap((f) =>
            f.values.flatMap((v) =>
              v.normalized.kind === "number" ? [v.normalized.unit] : [],
            ),
          ),
      );
      if (
        mapping.dataKind === "number" &&
        units.size &&
        [...units].some((unit) => unit !== mapping.canonicalUnit)
      ) {
        setError(
          `${mapping.label}: source numbers are normalized in ${[...units].join(", ")}. Use that unit; changing the label does not convert values.`,
        );
        return;
      }
    }
    if (await onSave({ kind: "template", categoryId: id, mappings }))
      setNotice("Specification template saved.");
  };
  return (
    <fieldset
      className="category-fields"
      disabled={pending || reconcile !== null}
    >
      <form
        className="category-form"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({
            kind: "category",
            id,
            name,
            aliases: aliases
              .split(",")
              .map((a) => a.trim())
              .filter(Boolean),
          }).then((ok) => {
            if (ok) {
              setReconcile(state.revision);
            }
          });
        }}
      >
        <label>
          Canonical category name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Aliases, separated by commas
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} />
        </label>
        <button className="primary" disabled={pending}>
          Save category and aliases
        </button>
      </form>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {state.categories.some((c) => c.id === id) && (
        <>
          <h3>Confirmed field mappings</h3>
          <p>
            Values display their actual normalized units. A unit change does not
            convert source values.
          </p>
          {mappings.map((mapping, i) => {
            const change = (patch: Partial<FieldMapping>) =>
              setMappings((all) =>
                all.map((m, j) => (j === i ? { ...m, ...patch } : m)),
              );
            return (
              <fieldset className="mapping" key={mapping.key}>
                <legend>
                  {observed.find((f) =>
                    parameterSourceKeys(mapping).includes(f.key),
                  )?.name ?? mapping.label}
                </legend>
                <label>
                  Source property
                  <select
                    multiple
                    aria-label="Source property"
                    value={parameterSourceKeys(mapping)}
                    onChange={(e) =>
                      change({
                        sourceKeys: Array.from(
                          e.target.selectedOptions,
                          (option) => option.value,
                        ),
                      })
                    }
                  >
                    {[...new Map(observed.map((f) => [f.key, f])).values()].map(
                      (f) => (
                        <option key={f.key} value={f.key}>
                          {f.pset} / {f.name}
                        </option>
                      ),
                    )}
                    {parameterSourceKeys(mapping)
                      .filter((key) => !observed.some((f) => f.key === key))
                      .map((key) => (
                        <option key={key} value={key}>
                          {key}
                        </option>
                      ))}
                  </select>
                  <small>
                    Select all source properties that express this parameter.
                    Conflicting overlapping values remain visible.
                  </small>
                </label>
                <label>
                  Display label
                  <input
                    value={mapping.label}
                    onChange={(e) => change({ label: e.target.value })}
                  />
                </label>
                <label>
                  Data kind
                  <select
                    value={mapping.dataKind}
                    onChange={(e) =>
                      change({
                        dataKind:
                          e.target.value === "number" ? "number" : "text",
                      })
                    }
                  >
                    <option value="number">Number</option>
                    <option value="text">Text</option>
                  </select>
                </label>
                <label>
                  Canonical unit
                  <input
                    value={mapping.canonicalUnit ?? ""}
                    onChange={(e) =>
                      change({ canonicalUnit: e.target.value || null })
                    }
                  />
                </label>
                <label>
                  Field role
                  <select
                    value={mapping.role}
                    onChange={(e) =>
                      change({
                        role:
                          e.target.value === "variant"
                            ? "variant"
                            : "specification",
                      })
                    }
                  >
                    <option value="specification">Specification</option>
                    <option value="variant">Variant</option>
                  </select>
                </label>
                <button
                  onClick={() =>
                    setMappings((all) => all.filter((_, j) => j !== i))
                  }
                >
                  Remove mapping
                </button>
              </fieldset>
            );
          })}
          <button onClick={() => void saveTemplate()} disabled={pending}>
            Save specification template
          </button>
          <h3>Suggested source properties</h3>
          {suggestions.length ? (
            suggestions.map((s) => (
              <div className="suggestion" key={s.key}>
                <span>
                  {s.label} · {s.canonicalUnit ?? "Text / unknown unit"}
                </span>
                <button
                  onClick={() =>
                    setMappings((all) => [
                      ...all,
                      {
                        ...s,
                        key: parameterSourceKeys(s).includes(s.key)
                          ? crypto.randomUUID()
                          : s.key,
                        sourceKeys: parameterSourceKeys(s),
                      },
                    ])
                  }
                >
                  Confirm mapping {s.label}
                </button>
              </div>
            ))
          ) : (
            <p>No unconfirmed property suggestions.</p>
          )}
        </>
      )}
    </fieldset>
  );
}
