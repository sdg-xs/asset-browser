import { useState } from "react";
import type { CatalogLibrary } from "../../shared/catalog-library.js";
export function CatalogTabs({ onLibrary, categoriesOpen, onCategories }: {
  onLibrary(): void;
  categoriesOpen: boolean;
  onCategories(): void;
}) {
  return <nav className="catalog-tabs" aria-label="Library workspaces">
    <button aria-label="Library" aria-current={!categoriesOpen ? "page" : undefined} onClick={onLibrary}>Library</button>
    <button aria-label="Categories" aria-current={categoriesOpen ? "page" : undefined}
      aria-expanded={categoriesOpen} aria-controls="category-management" onClick={onCategories}>
      Manage Categories
    </button>
  </nav>;
}
export function CatalogSidebar({
  state,
  selectedCategories,
  onCategoriesFilter,
  categoriesOpen,
}: {
  state: CatalogLibrary | null;
  selectedCategories: string[] | null;
  onCategoriesFilter(value: string[] | null): void;
  categoriesOpen: boolean;
}) {
  const [categorySearch, setCategorySearch] = useState("");
  const query = categorySearch.trim().toLocaleLowerCase();
  const categories = state?.categories.filter(category => category.name.toLocaleLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })) ?? [];
  return (
    <aside className="catalog-sidebar">
        <div className="category-navigation">
          <span className="eyebrow">CATEGORIES</span>
          {!categoriesOpen && <>
            <input className="category-search" type="search" aria-label="Search categories"
              placeholder="Search categories" value={categorySearch}
              onChange={event => setCategorySearch(event.target.value)} />
            <label className="category-filter check">
              <input type="checkbox" checked={selectedCategories === null}
                onChange={event => onCategoriesFilter(event.target.checked ? null : [])} />
              All categories
            </label>
            <div className="category-filter-list" role="region" aria-label="Category filters" tabIndex={0}>
            {categories.map((c) => (
              <label
                key={c.id}
                className="category-filter check"
              >
                <input type="checkbox" checked={selectedCategories === null || selectedCategories.includes(c.id)}
                  onChange={event => {
                    const ids = selectedCategories ?? state?.categories.map(category => category.id) ?? [];
                    const next = event.target.checked ? [...ids, c.id] : ids.filter(id => id !== c.id);
                    onCategoriesFilter(state?.categories.every(category => next.includes(category.id)) ? null : next);
                  }} />
                <span>{c.name}</span>
              </label>
            ))}
            {categories.length === 0 && query && <p className="category-search-empty">No categories match your search.</p>}
            </div>
          </>}
        </div>
      <p className="sidebar-footnote">
        Create a category with its IFC Class and System, then upload assets into it.
      </p>
    </aside>
  );
}
