import { Box, ArrowUpRight } from "lucide-react";
import type { AssetType } from "../../shared/contracts.js";

export function AssetGrid({
  types,
  modelName,
  selectedId,
  mode,
  onSelect,
  onExpand,
}: {
  types: AssetType[];
  modelName: string;
  selectedId: string;
  mode: "grid" | "list";
  onSelect(asset: AssetType): void;
  onExpand(asset: AssetType): void;
}) {
  return (
    <div className={`assets ${mode}`} aria-label="Asset results">
      {types.map((type) => (
        <article
          key={type.id}
          className={`asset-card ${selectedId === type.id ? "selected" : ""}`}
        >
          <button
            className="asset-select"
            aria-label={`Inspect ${type.name || "Unnamed type"}`}
            aria-pressed={selectedId === type.id}
            onClick={() => onSelect(type)}
          >
            <span className="asset-placeholder">
              <Box size={32} strokeWidth={1.2} />
              <span>Preview on selection</span>
            </span>
            <span className="asset-info">
              <span className="asset-category">
                {type.categories.join(" · ")}
              </span>
              <strong>{type.name || "Unnamed type"}</strong>
              <span className="asset-class">
                {type.ifcClass.replace(/^IFC/, "")}
              </span>
              <span className="asset-footer">
                <span>{modelName}</span>
                <span>
                  {type.occurrenceIds.length} occurrence
                  {type.occurrenceIds.length === 1 ? "" : "s"}
                </span>
              </span>
            </span>
          </button>
          <button
            className="asset-expand icon-button"
            aria-label={`Open ${type.name || "Unnamed type"} in centered preview`}
            aria-haspopup="dialog"
            title="Open centered preview"
            onClick={() => onExpand(type)}
          >
            <ArrowUpRight size={17} />
          </button>
        </article>
      ))}
    </div>
  );
}
