import { describe, expect, it, vi } from 'vitest';
import { Scene as ThreeScene } from 'three';

import { AudioService } from './AudioService';
import type { RuntimeRenderer } from './RuntimeRenderer';
import type { SceneGraph, SceneManager } from './SceneManager';
import { SceneRunner } from './SceneRunner';
import { AssetLoader } from './AssetLoader';
import { ResourceManager } from './ResourceManager';
import { Camera3D } from '../nodes/3D/Camera3D';

function createRendererStub(width: number, height: number): RuntimeRenderer {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(canvas, 'clientHeight', { value: height, configurable: true });

  return {
    domElement: canvas,
    render: vi.fn(),
    setAutoClear: vi.fn(),
    clear: vi.fn(),
    clearDepth: vi.fn(),
  } as unknown as RuntimeRenderer;
}

function createSceneManagerStub(): SceneManager {
  return {} as unknown as SceneManager;
}

function createGraph(cameraNode: Camera3D): SceneGraph {
  return {
    version: '1.0.0',
    metadata: {},
    rootNodes: [cameraNode],
    nodeMap: new Map([[cameraNode.nodeId, cameraNode]]),
  };
}

describe('SceneRunner camera projection updates', () => {
  it('uses the project viewport base size for the 2D camera when no Layout2D exists', () => {
    const renderer = createRendererStub(300, 150);
    const runner = new SceneRunner(
      createSceneManagerStub(),
      renderer,
      new AudioService(),
      new AssetLoader(new ResourceManager('/'), new AudioService()),
      { width: 1920, height: 1080 }
    );
    const cameraNode = new Camera3D({
      id: 'runtime-perspective-base',
      name: 'Camera',
      projection: 'perspective',
    });

    (
      runner as unknown as {
        runtimeGraph: SceneGraph;
        render: () => void;
      }
    ).runtimeGraph = createGraph(cameraNode);

    (runner as unknown as { render: () => void }).render();

    const overlayCamera = (
      runner as unknown as { orthographicCamera: import('three').OrthographicCamera }
    ).orthographicCamera;
    expect(overlayCamera.left).toBe(-1080);
    expect(overlayCamera.right).toBe(1080);
    expect(overlayCamera.top).toBe(540);
    expect(overlayCamera.bottom).toBe(-540);
  });

  it('updates orthographic active camera bounds from viewport aspect and size', () => {
    const renderer = createRendererStub(300, 150);
    const runner = new SceneRunner(
      createSceneManagerStub(),
      renderer,
      new AudioService(),
      new AssetLoader(new ResourceManager('/'), new AudioService())
    );
    const cameraNode = new Camera3D({
      id: 'runtime-ortho',
      name: 'Camera',
      projection: 'orthographic',
      orthographicSize: 8,
    });

    (
      runner as unknown as {
        activeCamera: Camera3D;
        runtimeGraph: SceneGraph;
        scene: ThreeScene;
        render: () => void;
      }
    ).activeCamera = cameraNode;
    (runner as unknown as { runtimeGraph: SceneGraph }).runtimeGraph = createGraph(cameraNode);

    (runner as unknown as { render: () => void }).render();

    const camera = cameraNode.camera as import('three').OrthographicCamera;
    expect(camera.top).toBe(4);
    expect(camera.bottom).toBe(-4);
    expect(camera.left).toBe(-8);
    expect(camera.right).toBe(8);
  });

  it('keeps perspective camera aspect updates unchanged', () => {
    const renderer = createRendererStub(320, 160);
    const runner = new SceneRunner(
      createSceneManagerStub(),
      renderer,
      new AudioService(),
      new AssetLoader(new ResourceManager('/'), new AudioService())
    );
    const cameraNode = new Camera3D({
      id: 'runtime-perspective',
      name: 'Camera',
      projection: 'perspective',
    });

    (
      runner as unknown as {
        activeCamera: Camera3D;
        runtimeGraph: SceneGraph;
        scene: ThreeScene;
        render: () => void;
      }
    ).activeCamera = cameraNode;
    (runner as unknown as { runtimeGraph: SceneGraph }).runtimeGraph = createGraph(cameraNode);

    (runner as unknown as { render: () => void }).render();

    const camera = cameraNode.camera as import('three').PerspectiveCamera;
    expect(camera.aspect).toBe(2);
  });
});
