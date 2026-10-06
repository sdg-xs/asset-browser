import { entryIssues } from "../../shared/catalog-rules.js";
import { ArrowUpRight, Box } from "lucide-react";
import type {
  CatalogLibrary,
  LibraryEntry,
} from "../../shared/catalog-library.js";
import type { LibraryModel } from "../../shared/contracts.js";
import { entrySpecifications, fieldLabel, valueText } from "./display.js";
import { geometrySource } from "./useDefinitionPreview.js";
export function DefinitionCards({
  state,
  entries,
  models,
  selected,
  checked,
  mode,
  review,
  onSelect,
  onCheck,
}: {
  state: CatalogLibrary;
  entries: LibraryEntry[];
  models: LibraryModel[];
  selected: string;
  checked: string[];
  mode: "grid" | "list";
  review: boolean;
  onSelect(id: string, modal: boolean): void;
  onCheck(id: string): void;
}) {
  return (
    <div className={`definition-cards ${mode}`}>
      {entries.map((entry) => (
        <article
          className={`definition-card ${selected === entry.id ? "selected" : ""}`}
          key={entry.id}
        >
          {review && (
            <label className="card-check">
              <input
                type="checkbox"
                aria-label={`Select ${entry.definition.name}`}
                checked={checked.includes(entry.id)}
                onChange={() => onCheck(entry.id)}
              />
            </label>
          )}
          <button
            className="definition-select"
            aria-label={`Inspect ${entry.definition.name}`}
            aria-pressed={selected === entry.id}
            onClick={() => onSelect(entry.id, false)}
          >
            <div className="definition-art">
              <Box size={42} strokeWidth={1} />
              <span>
                {entry.definition.kind === "product"
                  ? "PRODUCT"
                  : "SPECIFICATION"}
              </span>
            </div>
            <div className="definition-card-copy">
              <span className="eyebrow">
                {state.categories.find(
                  (c) => c.id === entry.definition.categoryId,
                )?.name ?? "Uncategorized"}
              </span>
              <h3>{entry.definition.name}</h3>
              <p>
                {entry.definition.family ||
                  entry.definition.manufacturer.value ||
                  "Reusable definition"}
              </p>
              <div className="card-specs">
                {Object.entries(entrySpecifications(state, entry))
                  .slice(0, 3)
                  .map(([key, value]) => (
                    <span key={key}>
                      {fieldLabel(state, key)}{" "}
                      <strong>{valueText(value)}</strong>
                    </span>
                  ))}
              </div>
              {review && (
                <span className="badge">
                  {entry.status === "archived"
                    ? "Archived"
                    : `${entryIssues(state, entry).length} review issues`}
                </span>
              )}
              <span className="availability">
                {entry.sourceReferences.some(
                  (r, i) =>
                    (i === 0 || r.equivalent) &&
                    geometrySource(state, r, models),
                )
                  ? "Geometry available"
                  : "Geometry unavailable"}
                {entry.reviewFlags.length ? " · Source changed" : ""}
              </span>
            </div>
          </button>
          <button
            className="card-preview"
            aria-label={`Preview ${entry.definition.name}`}
            onClick={() => onSelect(entry.id, true)}
          >
            <ArrowUpRight size={19} />
          </button>
        </article>
      ))}
    </div>
  );
}
