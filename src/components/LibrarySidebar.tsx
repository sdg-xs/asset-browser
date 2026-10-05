import { FolderOpen, Layers3 } from "lucide-react";
import type { LibraryModel } from "../../shared/contracts.js";

export function LibrarySidebar({
  models,
  model,
  category,
  onCategory,
  onModel,
}: {
  models: LibraryModel[];
  model: LibraryModel | null;
  category: string;
  onCategory(value: string): void;
  onModel(id: string): void;
}) {
  const categories = new Map<string, number>();
  for (const type of model?.index?.types ?? [])
    for (const name of type.categories)
      categories.set(name, (categories.get(name) ?? 0) + 1);
  return (
    <aside className="sidebar" aria-label="Library collections">
      <div className="sidebar-heading">
        <FolderOpen size={18} />
        <h2>Collections</h2>
        <span className="count">{models.length}</span>
      </div>
      <label className="field-label" htmlFor="source-model">
        Source model
      </label>
      <select
        id="source-model"
        value={model?.id ?? ""}
        onChange={(event) => onModel(event.target.value)}
      >
        {!model && <option value="">No models</option>}
        {models.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
            {item.index ? "" : " · not indexed"}
          </option>
        ))}
      </select>
      {model && (
        <div className="source-meta">
          <span>
            {model.source === "existing" ? "Source folder" : "Uploaded model"}
          </span>
          <span>{(model.size / 1024 / 1024).toFixed(1)} MiB</span>
        </div>
      )}
      <div className="category-heading">
        <h2>Categories</h2>
        <span className="count">{categories.size}</span>
      </div>
      <nav className="categories" aria-label="Asset categories">
        <button
          className={!category ? "category active" : "category"}
          onClick={() => onCategory("")}
          aria-pressed={!category}
        >
          <Layers3 size={16} />
          <span>All asset types</span>
          <span>{model?.index?.types.length ?? 0}</span>
        </button>
        {[...categories]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, count]) => (
            <button
              key={name}
              className={category === name ? "category active" : "category"}
              onClick={() => onCategory(name)}
              aria-pressed={category === name}
              aria-label={`${name}, ${count} type${count === 1 ? "" : "s"}`}
            >
              <span className="category-dot" />
              <span>{name}</span>
              <span>{count}</span>
            </button>
          ))}
      </nav>
      <div className="sidebar-footer">
        <span className="local-dot" />
        Local library<span>IFC</span>
      </div>
    </aside>
  );
}
