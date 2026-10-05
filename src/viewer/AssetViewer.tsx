import { useEffect, useRef, useState } from 'react';
import * as OBC from '@thatopen/components';
import * as THREE from 'three';
import type { PreviewGeometry } from '../../shared/contracts.js';

export function AssetViewer({ geometry }: { geometry: PreviewGeometry }) {
  const container = useRef<HTMLDivElement>(null);
  const fit = useRef<() => void>(() => {});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    const components = new OBC.Components();
    const meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
    let resize: ResizeObserver | undefined;
    setError(null);
    try {
      const world = components.get(OBC.Worlds).create<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>();
      world.scene = new OBC.SimpleScene(components);
      world.renderer = new OBC.SimpleRenderer(components, host, { antialias: true });
      world.camera = new OBC.SimpleCamera(components);
      world.scene.setup({ backgroundColor: new THREE.Color('#eef2f3') });
      const group = new THREE.Group();
      for (const piece of geometry.meshes) {
        const buffer = new THREE.BufferGeometry();
        buffer.setAttribute('position', new THREE.BufferAttribute(piece.positions, 3));
        buffer.setAttribute('normal', new THREE.BufferAttribute(piece.normals, 3));
        buffer.setIndex(new THREE.BufferAttribute(piece.indices, 1));
        const [r = 0.7, g = 0.7, b = 0.7, a = 1] = piece.color;
        const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(r, g, b), opacity: a, transparent: a < 1, roughness: 0.72, metalness: 0, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(buffer, material);
        mesh.applyMatrix4(new THREE.Matrix4().fromArray(piece.transform));
        meshes.push(mesh); group.add(mesh);
      }
      const bounds = new THREE.Box3().setFromObject(group);
      if (bounds.isEmpty()) throw new Error('This occurrence has no visible geometry.');
      const center = bounds.getCenter(new THREE.Vector3());
      group.position.sub(center);
      world.scene.three.add(group);
      const size = bounds.getSize(new THREE.Vector3());
      const radius = Math.max(size.length() / 2, 0.001);
      const camera = world.camera.three;
      camera.near = Math.max(radius / 1000, 0.000001);
      camera.far = radius * 1000;
      camera.updateProjectionMatrix();
      const controls = world.camera.controls;
      controls.minDistance = radius * 0.05;
      controls.maxDistance = radius * 100;
      fit.current = () => {
        const distance = radius * 3;
        void controls.setLookAt(distance, distance * 0.7, distance, 0, 0, 0, false);
        void controls.fitToSphere(new THREE.Sphere(new THREE.Vector3(), radius), false);
      };
      components.init();
      fit.current();
      resize = new ResizeObserver(() => { world.renderer?.resize(); world.camera.updateAspect(); });
      resize.observe(host);
      // Expose actual renderer evidence on the viewport for browser verification.
      host.dataset.meshes = String(meshes.length);
      host.dataset.triangles = String(meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? 0) / 3, 0));
      host.dataset.bounds = JSON.stringify(size.toArray());
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create 3D preview.'); }
    return () => {
      resize?.disconnect();
      fit.current = () => {};
      for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); }
      components.dispose();
      host.replaceChildren();
    };
  }, [geometry]);

  return <section aria-label="Representative 3D preview" style={{ position: 'relative' }}>
    <div ref={container} data-testid="asset-viewport" style={{ height: 'min(55vh, 520px)', minHeight: 240, width: '100%', position: 'relative' }} />
    <button type="button" onClick={() => fit.current()} style={{ position: 'absolute', top: 12, right: 12 }}>Fit asset</button>
    {error && <p role="alert">{error}</p>}
    <p>Drag to orbit · Scroll to zoom · Right-drag to pan</p>
  </section>;
}
