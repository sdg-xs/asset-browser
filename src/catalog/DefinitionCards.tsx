import { ArrowUpRight, Box } from "lucide-react";
import type {
  CatalogLibrary,
  LibraryEntry,
} from "../../shared/catalog-library.js";
import type { SourceAvailability } from "./useSourceAvailability.js";
import { geometrySource } from "./useDefinitionPreview.js";
import { isFireRelatedAsset } from "./display.js";
export function DefinitionCards({
  state,
  entries,
  availability,
  selected,
  mode,
  onSelect,
}: {
  state: CatalogLibrary;
  entries: LibraryEntry[];
  availability: SourceAvailability;
  selected: string;
  mode: "grid" | "list";
  onSelect(id: string, modal: boolean): void;
}) {
  return (
    <div className={`definition-cards ${mode}`}>
      {entries.map((entry) => (
        <article
          className={`definition-card ${selected === entry.id ? "selected" : ""}`}
          key={entry.id}
        >
          <button
            className="definition-select"
            aria-label={`Inspect ${entry.definition.name}`}
            aria-pressed={selected === entry.id}
            onClick={() => onSelect(entry.id, false)}
          >
            {isFireRelatedAsset(state, entry) && <span className="definition-fire-symbol" role="img" aria-label="Fire-related asset">🔥</span>}
            <div className="definition-art">
              <Box size={42} strokeWidth={1} />
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
              <span className="availability">
                {availability.kind !== "ready"
                  ? "Geometry availability unknown"
                  : (entry.geometryReference
                    ? "kind" in entry.geometryReference || availability.models.some(model => {
                        const reference = entry.geometryReference;
                        return reference && !("kind" in reference) && model.id === reference.modelId &&
                          model.fingerprint === reference.fingerprint && model.creationIndex?.candidates.some(candidate =>
                            candidate.key === reference.candidateKey && candidate.occurrenceIds.includes(reference.occurrenceId));
                      })
                    : entry.sourceReferences.some(
                        (r, i) =>
                          (i === 0 || r.equivalent) &&
                          geometrySource(state, r, availability.models),
                      ))
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
