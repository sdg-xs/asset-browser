import type {
  CatalogLibrary,
  LibraryCommand,
  LibraryEntry,
  SourceReference,
} from "./catalog-library.js";
import { libraryCommandSchema } from "./catalog-library.js";
import { CatalogDomainError } from "./catalog-errors.js";
import { entryIssues } from "./catalog-review.js";
export { CatalogDomainError } from "./catalog-errors.js";
export { entryIssues, duplicateCandidates } from "./catalog-review.js";
import { sourceFor, parameterSourceKeys } from "./catalog-observations.js";
import { acceptPublication } from "./catalog-publication.js";
import { changedReferences } from "./catalog-references.js";
import { importSnapshot } from "./catalog-import.js";
import { splitEntry } from "./catalog-split.js";
export { entryFieldSuggestions } from "./catalog-observations.js";

export function emptyCatalogLibrary(): CatalogLibrary {
  return {
    schemaVersion: 1,
    revision: 0,
    categories: [],
    templates: [],
    sources: [],
    entries: [],
  };
}
function requireEntry(state: CatalogLibrary, id: string): LibraryEntry {
  const entry = state.entries.find((entry) => entry.id === id);
  if (!entry)
    throw new CatalogDomainError("NOT_FOUND", `Entry not found: ${id}`);
  return entry;
}
function validateReferences(
  state: CatalogLibrary,
  references: SourceReference[],
): void {
  const used = new Set<string>();
  for (const reference of references) {
    const source = sourceFor(state, reference.sourceId);
    if (
      !source ||
      !source.current ||
      source.fingerprint !== reference.fingerprint
    )
      throw new CatalogDomainError(
        "INVALID_COMMAND",
        "Source reference must identify a current source fingerprint.",
      );
    for (const id of reference.occurrenceIds) {
      const key = `${reference.sourceId}/${id}`;
      if (used.has(key) || !source.observation.occurrenceIds.includes(id))
        throw new CatalogDomainError(
          "INVALID_COMMAND",
          "Source occurrence membership is invalid or repeated.",
        );
      used.add(key);
    }
    if (!reference.occurrenceIds.length)
      throw new CatalogDomainError(
        "INVALID_COMMAND",
        "Choose at least one occurrence for a reviewed source.",
      );
  }
}
function validateSnapshot(
  command: Extract<LibraryCommand, { kind: "import" }>,
): void {
  const types = new Set<string>();
  for (const type of command.snapshot.types) {
    if (
      types.has(type.typeGlobalId) ||
      new Set(type.occurrenceIds).size !== type.occurrenceIds.length
    )
      throw new CatalogDomainError(
        "INVALID_COMMAND",
        "Snapshot contains repeated types or occurrences.",
      );
    types.add(type.typeGlobalId);
    const keys = new Set<string>();
    for (const field of type.fields) {
      if (keys.has(field.key))
        throw new CatalogDomainError(
          "INVALID_COMMAND",
          "Snapshot contains repeated field keys.",
        );
      keys.add(field.key);
      const membership = new Set<number>();
      for (const value of field.values)
        for (const id of value.occurrenceIds) {
          if (!type.occurrenceIds.includes(id) || membership.has(id))
            throw new CatalogDomainError(
              "INVALID_COMMAND",
              "Snapshot field occurrence membership is invalid or repeated.",
            );
          membership.add(id);
        }
    }
  }
}
function updateCategory(
  state: CatalogLibrary,
  command: Extract<LibraryCommand, { kind: "category" }>,
): void {
  const target = state.categories.find(
    (category) => category.id === command.id,
  );
  const absorbed = state.categories.filter(
    (category) =>
      category.id !== command.id && command.aliases.includes(category.name),
  );
  const absorbedIds = new Set(absorbed.map((category) => category.id));
  const aliases = [
    ...new Set([
      ...command.aliases,
      ...absorbed.flatMap((category) => category.aliases),
      ...(target && target.name !== command.name ? [target.name] : []),
    ]),
  ];
  const labels = [command.name, ...aliases];
  if (
    new Set(labels).size !== labels.length ||
    state.categories.some(
      (category) =>
        category.id !== command.id &&
        !absorbedIds.has(category.id) &&
        [category.name, ...category.aliases].some((label) =>
          labels.includes(label),
        ),
    )
  ) {
    throw new CatalogDomainError(
      "INVALID_COMMAND",
      "Category labels must map to one canonical category.",
    );
  }
  if (target) {
    target.name = command.name;
    target.aliases = aliases;
  } else state.categories.push({ id: command.id, name: command.name, aliases });
  let template = state.templates.find(
    (template) => template.categoryId === command.id,
  );
  if (!template) {
    template = { categoryId: command.id, mappings: [], suggestions: [] };
    state.templates.push(template);
  }
  for (const absorbedTemplate of state.templates.filter((candidate) =>
    absorbedIds.has(candidate.categoryId),
  )) {
    for (const mapping of [
      ...absorbedTemplate.mappings,
      ...absorbedTemplate.suggestions,
    ]) {
      if (
        ![...template.mappings, ...template.suggestions].some(
          (existing) => existing.key === mapping.key,
        )
      )
        template.suggestions.push(mapping);
    }
  }
  for (const entry of state.entries)
    if (
      entry.definition.categoryId !== null &&
      absorbedIds.has(entry.definition.categoryId)
    )
      entry.definition.categoryId = command.id;
  state.categories = state.categories.filter(
    (category) => !absorbedIds.has(category.id),
  );
  state.templates = state.templates.filter(
    (template) => !absorbedIds.has(template.categoryId),
  );
}
export function applyLibraryCommand(
  state: CatalogLibrary,
  input: LibraryCommand,
): CatalogLibrary {
  const parsed = libraryCommandSchema.safeParse(input);
  if (!parsed.success)
    throw new CatalogDomainError(
      "INVALID_COMMAND",
      "Invalid catalog command.",
      parsed.error.issues.map((issue) => issue.message),
    );
  const command = parsed.data;
  if (command.expectedRevision !== state.revision)
    throw new CatalogDomainError(
      "REVISION_CONFLICT",
      "Catalog revision changed.",
    );
  const next = structuredClone(state);
  switch (command.kind) {
    case "import":
      validateSnapshot(command);
      if (!importSnapshot(next, command.snapshot)) return state;
      break;
    case "edit": {
      const entry = requireEntry(next, command.entryId);
      if (
        command.definition.categoryId !== null &&
        !next.categories.some(
          (category) => category.id === command.definition.categoryId,
        )
      )
        throw new CatalogDomainError("NOT_FOUND", "Category not found.");
      if (
        command.sourceRebindings?.length &&
        !command.confirmedSourceReferences
      )
        throw new CatalogDomainError(
          "INVALID_COMMAND",
          "Source rebindings require confirmed references.",
        );
      entry.definition = command.definition;
      if (command.confirmedSourceReferences) {
        validateReferences(
          next,
          changedReferences(
            entry,
            command.confirmedSourceReferences,
            command.sourceRebindings,
          ),
        );
        entry.sourceReferences = command.confirmedSourceReferences;
        entry.reviewFlags = entry.sourceReferences.some(
          (r) => sourceFor(next, r.sourceId)?.fingerprint !== r.fingerprint,
        )
          ? ["source-changed"]
          : [];
      }
      if (entry.status === "approved") entry.status = "draft";
      break;
    }
    case "approve": {
      const entries = [...new Set(command.entryIds)].map((id) =>
        requireEntry(next, id),
      );
      const issues = entries.flatMap((entry) =>
        entryIssues(next, entry).map((issue) => `${entry.id}: ${issue}`),
      );
      if (issues.length)
        throw new CatalogDomainError(
          "PUBLICATION_INVALID",
          "Publication requirements are incomplete.",
          issues,
        );
      entries.forEach((entry) => {
        acceptPublication(next, entry);
        entry.status = "approved";
      });
      break;
    }
    case "archive":
    case "restore":
      command.entryIds.forEach((id) => {
        requireEntry(next, id).status =
          command.kind === "archive" ? "archived" : "draft";
      });
      break;
    case "merge": {
      const target = requireEntry(next, command.targetId);
      const absorbed = [...new Set(command.absorbedIds)].map((id) =>
        requireEntry(next, id),
      );
      if (
        target.status === "archived" ||
        absorbed.some(
          (entry) => entry.id === target.id || entry.status === "archived",
        )
      )
        throw new CatalogDomainError(
          "INVALID_COMMAND",
          "Merge requires distinct active entries.",
        );
      for (const entry of absorbed) {
        for (const reference of entry.sourceReferences) {
          const existing = target.sourceReferences.find(
            (candidate) =>
              candidate.sourceId === reference.sourceId &&
              candidate.fingerprint === reference.fingerprint,
          );
          if (existing)
            existing.occurrenceIds = [
              ...new Set([
                ...existing.occurrenceIds,
                ...reference.occurrenceIds,
              ]),
            ];
          else target.sourceReferences.push(structuredClone(reference));
        }
        for (const flag of entry.reviewFlags)
          if (!target.reviewFlags.includes(flag)) target.reviewFlags.push(flag);
        entry.status = "archived";
      }
      target.status = "draft";
      break;
    }
    case "split":
      splitEntry(
        next,
        requireEntry(next, command.entryId),
        command.variantFieldKeys,
      );
      break;
    case "category":
      updateCategory(next, command);
      break;
    case "template": {
      const template = next.templates.find(
        (template) => template.categoryId === command.categoryId,
      );
      if (!template)
        throw new CatalogDomainError(
          "NOT_FOUND",
          "Category template not found.",
        );
      if (
        new Set(command.mappings.map((mapping) => mapping.key)).size !==
        command.mappings.length
      )
        throw new CatalogDomainError(
          "INVALID_COMMAND",
          "Template mapping keys must be unique.",
        );
      const rawKeys = command.mappings.flatMap(parameterSourceKeys);
      if (new Set(rawKeys).size !== rawKeys.length)
        throw new CatalogDomainError(
          "INVALID_COMMAND",
          "Each source property must map to one category parameter.",
        );
      for (const mapping of command.mappings) {
        if (!mapping.label.trim())
          throw new CatalogDomainError(
            "INVALID_COMMAND",
            "Parameter labels cannot be blank.",
          );
        const keys = parameterSourceKeys(mapping);
        const sourceIds = new Set(
          next.entries
            .filter((e) => e.definition.categoryId === command.categoryId)
            .flatMap((e) => e.sourceReferences.map((r) => r.sourceId)),
        );
        const observations = next.sources
          .filter((s) => sourceIds.has(s.id))
          .flatMap((s) => s.observation.fields)
          .filter((f) => keys.includes(f.key));
        const incompatible = observations.some((field) =>
          field.values.some(({ normalized: value, sourceMeasure }) => {
            if (value.kind === "missing") return false;
            if (value.kind === "number")
              return (
                mapping.dataKind !== "number" ||
                value.unit !== mapping.canonicalUnit
              );
            const unresolved =
              value.unresolvedMeasure ||
              value.unit !== null ||
              /MEASURE|Mixed IFC measures/i.test(
                sourceMeasure ?? field.measure,
              );
            return (
              !unresolved &&
              (mapping.dataKind !== "text" || mapping.canonicalUnit !== null)
            );
          }),
        );
        if (incompatible)
          throw new CatalogDomainError(
            "INVALID_COMMAND",
            "Mapped properties must use their actual normalized kind and unit.",
          );
        for (const entry of next.entries.filter(
          (e) => e.definition.categoryId === command.categoryId,
        )) {
          for (const key of keys.filter((key) => key !== mapping.key)) {
            const value = entry.definition.specifications[key];
            if (value === undefined) continue;
            const existing = entry.definition.specifications[mapping.key];
            if (existing && JSON.stringify(existing) !== JSON.stringify(value))
              throw new CatalogDomainError(
                "INVALID_COMMAND",
                "Resolve differing curated overrides before combining their parameters.",
              );
            entry.definition.specifications[mapping.key] = value;
            delete entry.definition.specifications[key];
          }
        }
      }
      template.suggestions.push(
        ...template.mappings.filter(
          (old) =>
            !command.mappings.some((m) => m.key === old.key) &&
            !template.suggestions.some((s) => s.key === old.key),
        ),
      );
      template.mappings = command.mappings;
      template.suggestions = template.suggestions.filter(
        (suggestion) =>
          !command.mappings.some((mapping) =>
            parameterSourceKeys(suggestion).some((key) =>
              parameterSourceKeys(mapping).includes(key),
            ),
          ),
      );
      break;
    }
    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
  next.revision += 1;
  return next;
}
