import type { AssetType, CatalogIndex, LibraryModel } from '../../shared/contracts.js';

export interface Candidate {
  elementId: number;
  instanceCategory: string | undefined;
  typeCategory: string | undefined;
  type: { globalId: string; name: string; ifcClass: string } | null;
}

export function effectiveCategory(instance: string | undefined, type: string | undefined): string | null {
  const value = (instance ?? type ?? '').trim();
  return !value || value.toUpperCase() === 'NA' ? null : value;
}

export function buildCatalog(model: Pick<LibraryModel, 'id' | 'fingerprint'>, candidates: Candidate[]): CatalogIndex {
  const types = new Map<string, AssetType>();
  const stats = { elements: candidates.length, classified: 0, excluded: 0, untyped: 0 };
  for (const candidate of candidates) {
    const category = effectiveCategory(candidate.instanceCategory, candidate.typeCategory);
    if (category === null) { stats.excluded++; continue; }
    if (!candidate.type) { stats.untyped++; continue; }
    stats.classified++;
    const id = `${model.id}:${candidate.type.globalId}`;
    const existing = types.get(id);
    if (existing) {
      existing.occurrenceIds.push(candidate.elementId);
      if (!existing.categories.includes(category)) existing.categories.push(category);
    } else {
      types.set(id, { id, modelId: model.id, typeGlobalId: candidate.type.globalId, name: candidate.type.name,
        ifcClass: candidate.type.ifcClass, categories: [category], occurrenceIds: [candidate.elementId], representativeId: candidate.elementId });
    }
  }
  return { schemaVersion: 1, modelId: model.id, fingerprint: model.fingerprint, types: [...types.values()], stats };
}
