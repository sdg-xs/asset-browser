import type { CatalogLibrary } from "../../shared/catalog-library.js";
export type Workspace = "Library" | "Needs review" | "Categories" | "Sources";
export function CatalogSidebar({
  state,
  workspace,
  onWorkspace,
  category,
  onCategory,
}: {
  state: CatalogLibrary | null;
  workspace: Workspace;
  onWorkspace(value: Workspace): void;
  category: string;
  onCategory(value: string): void;
}) {
  return (
    <aside className="catalog-sidebar">
      <nav aria-label="Library workspaces">
        {(["Library", "Needs review", "Categories", "Sources"] as const).map(
          (name) => (
            <button
              key={name}
              aria-label={name}
              aria-current={workspace === name ? "page" : undefined}
              onClick={() => onWorkspace(name)}
            >
              {name}
              {name === "Needs review" && (
                <span>
                  {state?.entries.filter(
                    (e) =>
                      e.status === "draft" ||
                      (e.status === "approved" && e.reviewFlags.length > 0),
                  ).length ?? 0}
                </span>
              )}
            </button>
          ),
        )}
      </nav>
      {(workspace === "Library" || workspace === "Needs review") && (
        <div className="category-navigation">
          <span className="eyebrow">CATEGORIES</span>
          <button aria-pressed={!category} onClick={() => onCategory("")}>
            All categories
          </button>
          {state?.categories.map((c) => (
            <button
              key={c.id}
              aria-pressed={category === c.id}
              onClick={() => onCategory(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <p className="sidebar-footnote">
        Staff-curated definitions.
        <br />
        Original IFC sources retained.
      </p>
    </aside>
  );
}
