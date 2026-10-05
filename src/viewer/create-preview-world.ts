import * as OBC from '@thatopen/components';

export function createPreviewWorld({ components, createRenderer }: {
  components: OBC.Components;
  createRenderer: () => OBC.SimpleRenderer;
}) {
  const worlds = components.get(OBC.Worlds);
  const world = worlds.create<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>();
  let scene: OBC.SimpleScene | undefined;
  let renderer: OBC.SimpleRenderer | undefined;
  let camera: OBC.SimpleCamera | undefined;
  try {
    scene = new OBC.SimpleScene(components);
    world.scene = scene;
    renderer = createRenderer();
    world.renderer = renderer;
    camera = new OBC.SimpleCamera(components);
    world.camera = camera;
    return world;
  } catch (error) {
    // SimpleWorld.dispose requires both scene and camera, even during failed setup.
    worlds.list.delete(world.uuid);
    camera?.dispose();
    renderer?.dispose();
    scene?.dispose();
    throw error;
  }
}
