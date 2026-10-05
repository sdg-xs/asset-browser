import { describe, expect, it } from 'vitest';
import { buildCatalog, effectiveCategory, type Candidate } from '../src/ifc/catalog.js';

const model = { id: 'b3907523-463f-414b-8235-1d5e1cce0454', fingerprint: 'revision' };
const typed = { globalId: 'guid', name: 'Sensor', ifcClass: 'IFCSENSORTYPE' };
const base: Candidate = { elementId: 1, instanceCategory: undefined, typeCategory: 'Air quality sensor', type: typed };

describe('classification policy', () => {
  it('falls back only for absent instance properties', () => {
    expect(effectiveCategory(undefined, 'Sensor')).toBe('Sensor');
    expect(effectiveCategory('', 'Sensor')).toBeNull();
    expect(effectiveCategory(' NA ', 'Sensor')).toBeNull();
    expect(effectiveCategory('na', 'Sensor')).toBeNull();
    expect(effectiveCategory(' Other ', 'Sensor')).toBe('Other');
  });
  it('groups occurrences and preserves all categories', () => {
    const result = buildCatalog(model, [base, { ...base, elementId: 2, instanceCategory: 'Temperature sensor' }]);
    expect(result.types).toHaveLength(1);
    expect(result.types[0]).toMatchObject({ occurrenceIds: [1, 2], representativeId: 1, categories: ['Air quality sensor', 'Temperature sensor'] });
  });
  it('keeps equal type names in different models distinct', () => {
    expect(buildCatalog(model, [base]).types[0]?.id).not.toBe(buildCatalog({ ...model, id: 'bf5af6c4-628b-4b5e-a80a-2edcedc00691' }, [base]).types[0]?.id);
  });
  it('counts the physical population with separate excluded and untyped outcomes', () => {
    const result = buildCatalog(model, [base, { ...base, elementId: 2, instanceCategory: '' }, { ...base, elementId: 3, type: null }]);
    expect(result.stats).toEqual({ elements: 3, classified: 1, excluded: 1, untyped: 1 });
  });
});
