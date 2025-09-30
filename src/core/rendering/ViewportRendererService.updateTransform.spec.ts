import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Group, MathUtils, Object3D, PerspectiveCamera, Scene, Vector3 } from 'three';

import { ViewportRendererService } from './ViewportRendererService';
import { Node3D } from '../scene/nodes/Node3D';
import type { NodeBase } from '../scene/nodes/NodeBase';
import type { SceneGraph } from '../scene/types';

const stubSelectionService = () => ({
  initialize: vi.fn(),
  updateSelection: vi.fn(),
  dispose: vi.fn(),
});

describe('ViewportRendererService.setSceneGraph', () => {
  it('restores camera state when preserveCamera option is enabled', () => {
    const service = new ViewportRendererService();
    const selectionService = stubSelectionService();
    const sceneRoot = new Group();
    const mainScene = new Scene();

    Object.defineProperty(service, 'selectionService', {
      configurable: true,
      value: selectionService,
    });

    const perspectiveCamera = new PerspectiveCamera();
    perspectiveCamera.position.set(10, 15, 20);
    perspectiveCamera.rotation.set(0.25, 0.5, -0.1);
    perspectiveCamera.updateMatrixWorld();

    const controlsTarget = new Vector3(5, 4, 3);
    const controlsUpdate = vi.fn();

    Object.assign(service as unknown as Record<string, unknown>, {
      perspectiveCamera,
      controls: {
        target: controlsTarget,
        update: controlsUpdate,
      },
      sceneContentRoot: sceneRoot,
      mainScene,
    });

    const environment = new Node3D({ id: 'environment', name: 'Environment' });
    const cameraNode = new Node3D({
      id: 'camera-node',
      name: 'Camera Node',
      position: { x: 0, y: 2, z: 6 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      properties: { kind: 'Camera' },
    });
    environment.adoptChild(cameraNode);

  const nodeMap = new Map<string, NodeBase>();
    nodeMap.set(environment.id, environment);
    nodeMap.set(cameraNode.id, cameraNode);

    const sceneGraph: SceneGraph = {
      version: '1.0.0',
      description: 'test',
      metadata: {},
      rootNodes: [environment],
      nodeMap,
    };

    service.setSceneGraph(sceneGraph, { preserveCamera: true });

    expect(perspectiveCamera.position.x).toBeCloseTo(10);
    expect(perspectiveCamera.position.y).toBeCloseTo(15);
    expect(perspectiveCamera.position.z).toBeCloseTo(20);
    expect(perspectiveCamera.rotation.x).toBeCloseTo(0.25);
    expect(perspectiveCamera.rotation.y).toBeCloseTo(0.5);
    expect(perspectiveCamera.rotation.z).toBeCloseTo(-0.1);
    expect(controlsTarget.x).toBeCloseTo(5);
    expect(controlsTarget.y).toBeCloseTo(4);
    expect(controlsTarget.z).toBeCloseTo(3);
    expect(controlsUpdate).toHaveBeenCalled();
  });
});

describe('ViewportRendererService.updateNodeTransform', () => {
  let service: ViewportRendererService;
  let selectionService: ReturnType<typeof stubSelectionService>;
  let sceneRoot: Group;

  beforeEach(() => {
    service = new ViewportRendererService();
    selectionService = stubSelectionService();
    sceneRoot = new Group();

    Object.defineProperty(service, 'selectionService', {
      configurable: true,
      value: selectionService,
    });

    Object.assign(service as unknown as Record<string, unknown>, {
      sceneContentRoot: sceneRoot,
    });
  });

  it('returns false when the target object is not in the scene graph', () => {
    const node = new Node3D({ id: 'missing', name: 'Missing Node' });

    expect(service.updateNodeTransform(node)).toBe(false);
    expect(selectionService.updateSelection).not.toHaveBeenCalled();
  });

  it('applies updated transforms to an existing node container', () => {
    const node = new Node3D({
      id: 'demo',
      name: 'Demo',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });

    const container = new Object3D();
    container.userData.nodeId = node.id;
    sceneRoot.add(container);

    node.position.x = 5;
    node.position.y = -2;
    node.position.z = 1.5;
    node.rotation.y = 45;

    expect(service.updateNodeTransform(node)).toBe(true);
    expect(container.position.x).toBeCloseTo(5);
    expect(container.position.y).toBeCloseTo(-2);
    expect(container.position.z).toBeCloseTo(1.5);
    expect(container.rotation.y).toBeCloseTo(MathUtils.degToRad(45));
    expect(selectionService.updateSelection).toHaveBeenCalled();
  });

  it('reapplies camera settings when updating a camera node', () => {
    const cameraNode = new Node3D({
      id: 'camera',
      name: 'Camera',
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 10, y: 15, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });
    cameraNode.properties.kind = 'Camera';

    const cameraContainer = new Object3D();
    cameraContainer.userData.nodeId = cameraNode.id;
    sceneRoot.add(cameraContainer);

    const perspectiveCamera = new PerspectiveCamera();
    Object.assign(service as unknown as Record<string, unknown>, {
      perspectiveCamera,
      controls: undefined,
    });

    expect(service.updateNodeTransform(cameraNode)).toBe(true);

    expect(perspectiveCamera.position.x).toBeCloseTo(cameraNode.position.x);
    expect(perspectiveCamera.position.y).toBeCloseTo(cameraNode.position.y);
    expect(perspectiveCamera.position.z).toBeCloseTo(cameraNode.position.z);
    expect(perspectiveCamera.rotation.x).toBeCloseTo(MathUtils.degToRad(cameraNode.rotation.x));
    expect(perspectiveCamera.rotation.y).toBeCloseTo(MathUtils.degToRad(cameraNode.rotation.y));
    expect(perspectiveCamera.rotation.z).toBeCloseTo(MathUtils.degToRad(cameraNode.rotation.z));
    expect(selectionService.updateSelection).toHaveBeenCalled();
  });
});
