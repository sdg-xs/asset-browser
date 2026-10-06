import type {
  CatalogLibrary,
  LibrarySnapshot,
  SourceTypeObservation,
  FieldMapping,
} from "./catalog-library.js";
import { reusableField } from "./catalog-observations.js";
import { parameterSourceKeys } from "./catalog-observations.js";

export function importSnapshot(
  state: CatalogLibrary,
  snapshot: LibrarySnapshot,
): boolean {
  let changed = false;
  const observedIds = new Set(snapshot.types.map((type) => type.typeGlobalId));
  for (const source of state.sources.filter(
    (source) => source.modelId === snapshot.modelId,
  )) {
    if (source.current && !observedIds.has(source.observation.typeGlobalId)) {
      source.current = false;
      changed = true;
      flagReferences(state, source.id);
    }
  }
  for (const observation of snapshot.types) {
    let source = state.sources.find(
      (candidate) =>
        candidate.modelId === snapshot.modelId &&
        candidate.observation.typeGlobalId === observation.typeGlobalId,
    );
    if (
      source?.fingerprint === snapshot.fingerprint &&
      source.current &&
      source.analysisVersion === snapshot.analysisVersion
    )
      continue;
    changed = true;
    if (source) {
      source.fingerprint = snapshot.fingerprint;
      source.sourceName = snapshot.sourceName;
      source.revision += 1;
      source.observation = observation;
      source.analysisVersion = snapshot.analysisVersion;
      source.current = true;
      flagReferences(state, source.id);
    } else {
      source = {
        analysisVersion: snapshot.analysisVersion,
        id: crypto.randomUUID(),
        modelId: snapshot.modelId,
        fingerprint: snapshot.fingerprint,
        sourceName: snapshot.sourceName,
        revision: 1,
        current: true,
        observation,
      };
      state.sources.push(source);
      const categoryId = seedCategories(state, observation);
      state.entries.push({
        id: crypto.randomUUID(),
        status: "draft",
        reviewFlags: [],
        definition: {
          name: observation.name,
          description: "",
          kind: "generic",
          family: null,
          categoryId,
          tags: [],
          manufacturer: { value: "", confirmed: false },
          model: { value: "", confirmed: false },
          specifications: {},
        },
        sourceReferences: [
          {
            sourceId: source.id,
            fingerprint: source.fingerprint,
            occurrenceIds: [...observation.occurrenceIds],
            equivalent: false,
          },
        ],
      });
    }
    seedCategories(state, observation);
  }
  return changed;
}
function flagReferences(state: CatalogLibrary, sourceId: string): void {
  for (const entry of state.entries) {
    if (
      entry.sourceReferences.some(
        (reference) => reference.sourceId === sourceId,
      ) &&
      !entry.reviewFlags.includes("source-changed")
    )
      entry.reviewFlags.push("source-changed");
  }
}
function seedCategories(
  state: CatalogLibrary,
  observation: SourceTypeObservation,
): string | null {
  const categoryIds: string[] = [];
  for (const label of observation.categories.filter((label) => label.trim())) {
    let category = state.categories.find(
      (category) => category.name === label || category.aliases.includes(label),
    );
    if (!category) {
      category = { id: crypto.randomUUID(), name: label, aliases: [] };
      state.categories.push(category);
      state.templates.push({
        categoryId: category.id,
        mappings: [],
        suggestions: [],
      });
    }
    if (!categoryIds.includes(category.id)) categoryIds.push(category.id);
    const template = state.templates.find(
      (template) => template.categoryId === category.id,
    );
    for (const field of observation.fields.filter(reusableField)) {
      if (
        !template ||
        template.suggestions.some((mapping) =>
          parameterSourceKeys(mapping).includes(field.key),
        ) ||
        template.mappings.some((mapping) =>
          parameterSourceKeys(mapping).includes(field.key),
        )
      )
        continue;
      const numeric = field.values.find(
        (value) => value.normalized.kind === "number",
      )?.normalized;
      const mapping: FieldMapping = {
        key: field.key,
        label: field.name,
        dataKind: numeric?.kind === "number" ? "number" : "text",
        canonicalUnit: numeric?.kind === "number" ? numeric.unit : null,
        role: "specification",
      };
      template.suggestions.push(mapping);
    }
  }
  return categoryIds.length === 1 ? (categoryIds[0] ?? null) : null;
}
