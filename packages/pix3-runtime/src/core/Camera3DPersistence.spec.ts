import { describe, expect, it } from 'vitest';
import { OrthographicCamera, PerspectiveCamera } from 'three';

import { AudioService } from './AudioService';
import { AssetLoader } from './AssetLoader';
import { ResourceManager } from './ResourceManager';
import { SceneLoader } from './SceneLoader';
import { SceneSaver } from './SceneSaver';
import { ScriptRegistry } from './ScriptRegistry';
import { Camera3D } from '../nodes/3D/Camera3D';

describe('Camera3D scene persistence', () => {
  it('serializes and parses a perspective camera', async () => {
    const cameraNode = new Camera3D({
      id: 'camera-perspective',
      name: 'Camera',
      projection: 'perspective',
      fov: 73,
      near: 0.5,
      far: 250,
    });

    const saver = new SceneSaver();
    const yaml = saver.serializeScene({
      version: '1.0.0',
      metadata: {},
      rootNodes: [cameraNode],
      nodeMap: new Map([[cameraNode.nodeId, cameraNode]]),
    });

    expect(yaml).toContain('projection: perspective');
    expect(yaml).toContain('fov: 73');

    const loader = new SceneLoader(
      new AssetLoader(new ResourceManager('/'), new AudioService()),
      new ScriptRegistry(),
      new ResourceManager('/')
    );
    const graph = await loader.parseScene(yaml, { filePath: 'res://scenes/main.pix3scene' });
    const loaded = graph.rootNodes[0] as Camera3D;

    expect(loaded.camera).toBeInstanceOf(PerspectiveCamera);
    expect(loaded.projection).toBe('perspective');
    expect(loaded.fov).toBe(73);
    expect(loaded.near).toBe(0.5);
    expect(loaded.far).toBe(250);
  });

  it('serializes and parses an orthographic camera with size', async () => {
    const cameraNode = new Camera3D({
      id: 'camera-ortho',
      name: 'Camera',
      projection: 'orthographic',
      orthographicSize: 12,
      near: 0.25,
      far: 300,
    });

    const saver = new SceneSaver();
    const yaml = saver.serializeScene({
      version: '1.0.0',
      metadata: {},
      rootNodes: [cameraNode],
      nodeMap: new Map([[cameraNode.nodeId, cameraNode]]),
    });

    expect(yaml).toContain('projection: orthographic');
    expect(yaml).toContain('orthographicSize: 12');

    const loader = new SceneLoader(
      new AssetLoader(new ResourceManager('/'), new AudioService()),
      new ScriptRegistry(),
      new ResourceManager('/')
    );
    const graph = await loader.parseScene(yaml, { filePath: 'res://scenes/main.pix3scene' });
    const loaded = graph.rootNodes[0] as Camera3D;

    expect(loaded.camera).toBeInstanceOf(OrthographicCamera);
    expect(loaded.projection).toBe('orthographic');
    expect(loaded.orthographicSize).toBe(12);
    expect(loaded.near).toBe(0.25);
    expect(loaded.far).toBe(300);
  });

  it('saves a switched orthographic camera using the orthographic payload', () => {
    const cameraNode = new Camera3D({ id: 'camera-switch', name: 'Camera', fov: 68 });
    cameraNode.projection = 'orthographic';
    cameraNode.orthographicSize = 9;

    const saver = new SceneSaver();
    const yaml = saver.serializeScene({
      version: '1.0.0',
      metadata: {},
      rootNodes: [cameraNode],
      nodeMap: new Map([[cameraNode.nodeId, cameraNode]]),
    });

    expect(yaml).toContain('projection: orthographic');
    expect(yaml).toContain('orthographicSize: 9');
    expect(yaml).not.toContain('\nfov:');
  });
});
