import { expect, it } from 'vitest';
import * as OBC from '@thatopen/components';
import { createPreviewWorld } from '../src/viewer/create-preview-world.js';

it('releases a real partial Components world after renderer failure, allowing retry and unmount', () => {
  const components = new OBC.Components();
  const worlds = components.get(OBC.Worlds);
  let scenesDisposed = 0;
  const unavailableRenderer = () => {
    const world = [...worlds.list.values()][0];
    if (!world) throw new Error('Expected the partial world to exist');
    world.scene.onDisposed.add(() => scenesDisposed++);
    throw new Error('WebGL is unavailable');
  };
  expect(() => createPreviewWorld({ components, createRenderer: unavailableRenderer })).toThrow('WebGL is unavailable');
  expect(() => components.dispose()).not.toThrow();
  expect(worlds.list.size).toBe(0);
  expect(scenesDisposed).toBe(1);
  const retry = new OBC.Components();
  expect(() => createPreviewWorld({ components: retry, createRenderer: () => { throw new Error('WebGL is still unavailable'); } })).toThrow('WebGL is still unavailable');
  expect(() => retry.dispose()).not.toThrow();
});
