import type {
  CatalogLibrary,
  LibraryEntry,
  DuplicateCandidate,
} from "./catalog-library.js";
import { equalNormalized, identityValue } from "./catalog-normalization.js";
import {
  comparableSpecifications,
  entryFieldSuggestions,
  hasUnnormalizedMeasure,
} from "./catalog-observations.js";
import { CatalogDomainError } from "./catalog-errors.js";
export function entryIssues(
  state: CatalogLibrary,
  entry: LibraryEntry,
): string[] {
  const issues: string[] = [];
  const definition = entry.definition;
  if (!definition.name.trim()) issues.push("Name is required.");
  if (
    !state.categories.some((category) => category.id === definition.categoryId)
  )
    issues.push("Canonical category is required.");
  const identityKnown =
    definition.manufacturer.confirmed &&
    definition.model.confirmed &&
    Boolean(identityValue(definition.manufacturer.value)) &&
    Boolean(identityValue(definition.model.value));
  if (definition.kind === "product" && !identityKnown)
    issues.push("Product requires confirmed manufacturer and model.");
  for (const suggestion of entryFieldSuggestions(state, entry)) {
    if (
      suggestion.status === "conflicting" &&
      !Object.hasOwn(definition.specifications, suggestion.key)
    )
      issues.push(`Unresolved source conflict: ${suggestion.key}`);
  }
  if (entry.status === "archived")
    issues.push("Archived entry cannot be approved.");
  return issues;
}
export function duplicateCandidates(
  state: CatalogLibrary,
  entryId: string,
): DuplicateCandidate[] {
  const entry = state.entries.find((entry) => entry.id === entryId);
  if (!entry)
    throw new CatalogDomainError("NOT_FOUND", `Entry not found: ${entryId}`);
  const specifications = comparableSpecifications(state, entry);
  return state.entries
    .filter(
      (other) =>
        other.id !== entryId &&
        other.status !== "archived" &&
        other.definition.categoryId === entry.definition.categoryId &&
        entry.definition.categoryId !== null,
    )
    .flatMap((other) => {
      const otherSpecifications = comparableSpecifications(state, other);
      const keys = new Set([
        ...Object.keys(specifications),
        ...Object.keys(otherSpecifications),
      ]);
      const differences: string[] = [];
      const missingEvidence: string[] = [];
      for (const key of keys) {
        const left = specifications[key];
        const right = otherSpecifications[key];
        if (
          !left ||
          !right ||
          left.kind === "missing" ||
          right.kind === "missing" ||
          (left.kind === "text" && left.unresolvedMeasure) ||
          (right.kind === "text" && right.unresolvedMeasure) ||
          (left.kind === "text" && hasUnnormalizedMeasure(state, entry, key)) ||
          (right.kind === "text" &&
            hasUnnormalizedMeasure(state, other, key)) ||
          (left.kind === "text" && left.unit !== null) ||
          (right.kind === "text" && right.unit !== null)
        )
          missingEvidence.push(key);
        else if (!equalNormalized(left, right)) differences.push(key);
      }
      const manufacturer = identityValue(
        entry.definition.manufacturer.value,
      ).toLowerCase();
      const model = identityValue(entry.definition.model.value).toLowerCase();
      const otherManufacturer = identityValue(
        other.definition.manufacturer.value,
      ).toLowerCase();
      const otherModel = identityValue(
        other.definition.model.value,
      ).toLowerCase();
      const bothIdentitiesKnown =
        Boolean(manufacturer && model && otherManufacturer && otherModel) &&
        entry.definition.manufacturer.confirmed &&
        entry.definition.model.confirmed &&
        other.definition.manufacturer.confirmed &&
        other.definition.model.confirmed;
      const sameIdentity =
        bothIdentitiesKnown &&
        manufacturer === otherManufacturer &&
        model === otherModel;
      if (!bothIdentitiesKnown)
        missingEvidence.push("confirmed product identity");
      else {
        if (manufacturer !== otherManufacturer)
          differences.push("manufacturer");
        if (model !== otherModel) differences.push("model");
      }
      const sameSpecifications =
        keys.size > 0 &&
        differences.length === 0 &&
        !missingEvidence.some((key) => key !== "confirmed product identity");
      const sameName =
        entry.definition.name.trim().toLowerCase() ===
          other.definition.name.trim().toLowerCase() &&
        Boolean(entry.definition.name.trim());
      if (!sameIdentity && !sameSpecifications && !sameName) return [];
      if (keys.size === 0) missingEvidence.push("reusable specifications");
      return [
        {
          entryId: other.id,
          confidence: sameIdentity
            ? "identity"
            : sameSpecifications
              ? "specifications"
              : "name",
          differences,
          missingEvidence,
        } satisfies DuplicateCandidate,
      ];
    });
}
