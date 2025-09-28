import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Object3D, Scene, Vector3 } from 'three';

import { ViewportSelectionService } from './ViewportSelectionService';
import { ServiceContainer, ServiceLifetime } from '../../fw/di';
import { ViewportRendererService } from './ViewportRendererService';
import { SceneManager } from '../scene/SceneManager';
import startupScene from '../services/templates/startup-scene.pix3scene?raw';
import { Node3D } from '../scene/nodes/Node3D';
import { Sprite2D } from '../scene/nodes/Sprite2D';

class StubViewportRendererService {
  setSceneGraph = vi.fn();
  dispose = vi.fn();
}

describe('ViewportSelectionService transform sync', () => {
  let service: ViewportSelectionService;
  let sceneManager: SceneManager;
  let container: ServiceContainer;
  let viewportToken: symbol;
  let stubRenderer: StubViewportRendererService;

  beforeEach(() => {
    container = ServiceContainer.getInstance();

    viewportToken = container.getOrCreateToken(ViewportRendererService);
    container.addService(
      viewportToken,
      StubViewportRendererService as unknown as new () => ViewportRendererService,
      ServiceLifetime.Singleton
    );
    stubRenderer = container.getService(viewportToken) as unknown as StubViewportRendererService;
    stubRenderer.setSceneGraph.mockClear();

    const sceneToken = container.getOrCreateToken(SceneManager);
    sceneManager = container.getService(sceneToken);
    sceneManager.dispose();
    const graph = sceneManager.parseScene(startupScene, { filePath: 'templ://startup-scene' });
    sceneManager.setActiveSceneGraph('sample-orbit-runner', graph);

    service = new ViewportSelectionService();
    Object.defineProperty(service, 'scene', { value: new Scene(), configurable: true });
  });

  afterEach(() => {
    container.addService(
      viewportToken,
      ViewportRendererService as unknown as new () => ViewportRendererService,
      ServiceLifetime.Singleton
    );
  });

  it('applies gizmo translation updates to Node3D via command', async () => {
    const graph = sceneManager.getActiveSceneGraph();
    const node = graph?.nodeMap.get('demo-box') as Node3D;

    const object = new Object3D();
    object.userData.nodeId = 'demo-box';
    object.position.set(3.5, -2, 1.25);
    object.rotation.set(0, 0, 0);
    object.scale.set(1, 1, 1);

    const { syncObjectTransformToSceneGraph } = service as unknown as {
      syncObjectTransformToSceneGraph: (target: Object3D) => Promise<void>;
    };

    await syncObjectTransformToSceneGraph.call(service, object);

    expect(node.position.x).toBeCloseTo(3.5, 4);
    expect(node.position.y).toBeCloseTo(-2, 4);
    expect(node.position.z).toBeCloseTo(1.25, 4);
    expect(stubRenderer.setSceneGraph).toHaveBeenCalled();
  });

  it('converts rotation to degrees when syncing Node3D transforms', async () => {
    const graph = sceneManager.getActiveSceneGraph();
    const node = graph?.nodeMap.get('demo-box') as Node3D;

    const object = new Object3D();
    object.userData.nodeId = 'demo-box';
    object.position.copy(new Vector3(node.position.x, node.position.y, node.position.z));
    object.rotation.set(Math.PI / 6, Math.PI / 4, Math.PI / 3);
    object.scale.set(node.scale.x, node.scale.y, node.scale.z);

    const { syncObjectTransformToSceneGraph } = service as unknown as {
      syncObjectTransformToSceneGraph: (target: Object3D) => Promise<void>;
    };

    await syncObjectTransformToSceneGraph.call(service, object);

    expect(node.rotation.x).toBeCloseTo(30, 4);
    expect(node.rotation.y).toBeCloseTo(45, 4);
    expect(node.rotation.z).toBeCloseTo(60, 4);
  });

  it('updates Sprite2D properties from viewport transform', async () => {
    const graph = sceneManager.getActiveSceneGraph();
    const node = graph?.nodeMap.get('logo-sprite') as Sprite2D;

    const object = new Object3D();
    object.userData.nodeId = 'logo-sprite';
    object.position.set(12.25, -4.5, 0);
    object.rotation.set(0, 0, Math.PI / 8);
    object.scale.set(1.2, 0.75, 1);

    const { syncObjectTransformToSceneGraph } = service as unknown as {
      syncObjectTransformToSceneGraph: (target: Object3D) => Promise<void>;
    };

    await syncObjectTransformToSceneGraph.call(service, object);

    expect(node.position.x).toBeCloseTo(12.25, 4);
    expect(node.position.y).toBeCloseTo(-4.5, 4);
    expect(node.rotation).toBeCloseTo(22.5, 4);
    expect(node.scale.x).toBeCloseTo(1.2, 4);
    expect(node.scale.y).toBeCloseTo(0.75, 4);
  });
});
