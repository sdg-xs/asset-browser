import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { IfcReader } from '../src/ifc/reader.js';

const model = { id: 'b3907523-463f-414b-8235-1d5e1cce0454', fingerprint: 'fixture' };
let reader: IfcReader | undefined;
afterEach(() => reader?.dispose());
describe('actual IFC4 extraction', () => {
  it('uses relation references, exact Psets, fallback and real occurrence geometry', async () => {
    reader = new IfcReader();
    await reader.initialize();
    const bytes = await readFile(new URL('./fixtures/assets.ifc', import.meta.url));
    const index = reader.open(bytes, model);
    expect(index.stats).toEqual({ elements: 5, classified: 2, excluded: 2, untyped: 1 });
    expect(index.types).toHaveLength(1);
    expect(index.types[0]).toMatchObject({ typeGlobalId: '0000000000000000000042', occurrenceIds: [30, 31], categories: ['Temperature sensor', 'Air quality sensor'], ifcClass: 'IFCBUILDINGELEMENTPROXYTYPE' });
    expect(reader.properties(30)).toContainEqual({ name: 'Identity Data', source: 'instance', values: [{ name: 'Generic Hard Asset', value: 'Temperature sensor' }] });
    expect(reader.properties(30)).toContainEqual({ name: 'Identity Data', source: 'type', values: [{ name: 'Generic Hard Asset', value: 'Air quality sensor' }] });
    const geometry = reader.geometry(30);
    expect(geometry.meshes.length).toBeGreaterThan(0);
    expect(geometry.meshes[0]?.positions.length).toBeGreaterThan(0);
    expect(geometry.meshes[0]?.indices.length).toBeGreaterThan(0);
    expect(() => reader?.geometry(99999)).toThrow();
  });
  it('rejects malformed bytes rather than returning a valid empty catalog', async () => {
    reader = new IfcReader();
    await reader.initialize();
    expect(() => reader?.open(new TextEncoder().encode('not IFC'), model)).toThrow(/IFC/i);
    expect(() => reader?.open(new TextEncoder().encode('ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;'), model)).toThrow(/IFC/i);
  });
  it('closes a previous source and supports opening again after failure', async () => {
    reader = new IfcReader();
    await reader.initialize();
    const bytes = await readFile(new URL('./fixtures/assets.ifc', import.meta.url));
    reader.open(bytes, model);
    expect(() => reader?.open(new TextEncoder().encode('bad'), model)).toThrow();
    expect(() => reader?.properties(30)).toThrow();
    expect(reader.open(bytes, model).types).toHaveLength(1);
    expect(reader.geometry(31).meshes.length).toBeGreaterThan(0);
  });
});
