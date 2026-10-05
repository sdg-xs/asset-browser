import { Box, ArrowUpRight } from "lucide-react";
import type { AssetType } from "../../shared/contracts.js";

export function AssetGrid({
  types,
  modelName,
  selectedId,
  mode,
  onSelect,
}: {
  types: AssetType[];
  modelName: string;
  selectedId: string;
  mode: "grid" | "list";
  onSelect(asset: AssetType): void;
}) {
  return (
    <div className={`assets ${mode}`} aria-label="Asset results">
      {types.map((type) => (
        <button
          key={type.id}
          className={`asset-card ${selectedId === type.id ? "selected" : ""}`}
          aria-label={`Inspect ${type.name || "Unnamed type"}`}
          aria-pressed={selectedId === type.id}
          onClick={() => onSelect(type)}
        >
          <span className="asset-placeholder">
            <Box size={32} strokeWidth={1.2} />
            <span>Preview on selection</span>
            <ArrowUpRight size={15} />
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
      ))}
    </div>
  );
}
