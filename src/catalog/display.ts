import type {
  CatalogLibrary,
  LibraryEntry,
  NormalizedValue,
} from "../../shared/catalog-library.js";
import {
  effectiveSpecifications,
  entryFieldSuggestions as sourceFieldSuggestions,
  parameterLabel,
  parameterSourceKeys,
} from "../../shared/catalog-observations.js";
import { visiblePropertySet } from "../property-display.js";
const numberFormat = new Intl.NumberFormat("en", {
  maximumSignificantDigits: 7,
  useGrouping: false,
});
export function valueText(value: NormalizedValue) {
  return value.kind === "missing"
    ? "Unknown"
    : String(
        value.kind === "number"
          ? numberFormat.format(value.value)
          : value.value,
      ) + (value.unit ? " " + value.unit : "");
}
export const fieldLabel = parameterLabel;
export function visibleParameter(
  state: CatalogLibrary,
  key: string,
  categoryId: string | null,
) {
  const template = state.templates.find((t) => t.categoryId === categoryId);
  const mapping = [...(template?.mappings ?? []), ...(template?.suggestions ?? [])]
    .find((m) => m.key === key);
  const keys = mapping ? parameterSourceKeys(mapping) : [key];
  const fields = state.sources.flatMap((s) => s.observation.fields)
    .filter((f) => keys.includes(f.key));
  return !fields.length || fields.some((f) => visiblePropertySet(f.pset));
}
export function entryFieldSuggestions(state: CatalogLibrary, entry: LibraryEntry) {
  return sourceFieldSuggestions(state, entry).filter((s) =>
    visibleParameter(state, s.key, entry.definition.categoryId),
  );
}
export function entryFieldLabel(
  state: CatalogLibrary,
  entry: LibraryEntry,
  key: string,
) {
  return (
    state.templates
      .find((t) => t.categoryId === entry.definition.categoryId)
      ?.mappings.find((m) => m.key === key)?.label ??
    (entry.status === "approved"
      ? entry.publication?.labels[key]
      : undefined) ??
    fieldLabel(state, key, entry.definition.categoryId)
  );
}
export function entrySpecifications(
  state: CatalogLibrary,
  entry: LibraryEntry,
) {
  const specifications = entry.status === "approved" && entry.publication
    ? entry.publication.specifications
    : effectiveSpecifications(state, entry);
  return Object.fromEntries(Object.entries(specifications).filter(([key]) =>
    visibleParameter(state, key, entry.definition.categoryId),
  ));
}

export function libraryParameters(state: CatalogLibrary, entry: LibraryEntry) {
  const source = state.sources.find(s => s.id === entry.sourceReferences[0]?.sourceId);
  const specifications = entrySpecifications(state, entry);
  const systemSpecification = specifications.System ?? Object.entries(specifications)
    .find(([key]) => entryFieldLabel(state, entry, key).trim().toLowerCase() === "system")?.[1];
  const classSpecification = specifications["IFC Class"] ?? Object.entries(specifications)
    .find(([key]) => entryFieldLabel(state, entry, key).replace(/\s/g, "").toLowerCase() === "ifcclass")?.[1];
  const systemField = source?.observation.fields.find(field =>
    visiblePropertySet(field.pset) && field.name.trim().toLowerCase() === "system",
  );
  const system = systemSpecification
    ? valueText(systemSpecification)
    : systemField?.values.find(value => value.normalized.kind !== "missing")?.normalized;
  return [
    { label: "IFC Class", value: classSpecification ? valueText(classSpecification) : source?.observation.ifcClass || "Unknown" },
    { label: "System", value: typeof system === "string" ? system : system ? valueText(system) : "Unknown" },
  ];
}

export function isFireRelatedAsset(state: CatalogLibrary, entry: LibraryEntry) {
  const category = state.categories.find(category => category.id === entry.definition.categoryId);
  const labels = [entry.definition.name, category?.name ?? "", ...entry.definition.tags,
    ...libraryParameters(state, entry).map(parameter => parameter.value)];
  return labels.some(label => /\b(?:fire|firealarm|firefighting|firestop|fireproof|firedoor|firedamper|sprinklers?|smoke|extinguishers?|hydrants?|hose[ -]reel|(?:heat|flame)[ -]detector)\b|brann|røyk|IFCFIRESUPPRESSIONTERMINAL/i.test(label.replaceAll("_", " ")));
}
