import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import {
  AssetLoader,
  ResourceManager,
  SceneLoader,
  SceneSaver,
  SceneValidationError,
  ScriptRegistry,
  registerBuiltInScripts,
} from '@pix3/runtime';

class InMemoryResourceManager extends ResourceManager {
  private readonly files: Record<string, string>;

  constructor(files: Record<string, string>) {
    super('/');
    this.files = files;
  }

  override async readText(resource: string): Promise<string> {
    const normalized = resource.replace(/\\/g, '/');
    const value = this.files[normalized];
    if (typeof value !== 'string') {
      throw new Error(`Missing in-memory resource: ${resource}`);
    }
    return value;
  }

  override normalize(resource: string): string {
    return resource.replace(/\\/g, '/');
  }
}

function createLoader(files: Record<string, string>): SceneLoader {
  const resources = new InMemoryResourceManager(files);
  const scriptRegistry = new ScriptRegistry();
  registerBuiltInScripts(scriptRegistry);
  const assetLoader = new AssetLoader(resources);
  return new SceneLoader(assetLoader, scriptRegistry, resources);
}

describe('Prefab scene instancing', () => {
  it('applies root properties and child overrides on instance load', async () => {
    const prefabText = `
version: 1.0.0
root:
  - id: player-root
    type: Node3D
    properties:
      position: { x: 1, y: 2, z: 3 }
    children:
      - id: weapon
        type: Node3D
        properties:
          visible: true
`;

    const sceneText = `
version: 1.0.0
root:
  - id: player-instance
    instance: res://prefabs/player.pix3scene
    properties:
      position: { x: 10, y: 0, z: 0 }
    overrides:
      byLocalId:
        weapon:
          properties:
            visible: false
`;

    const loader = createLoader({
      'res://prefabs/player.pix3scene': prefabText,
    });

    const graph = await loader.parseScene(sceneText, { filePath: 'res://scenes/main.pix3scene' });
    const instanceRoot = graph.rootNodes[0];
    expect(instanceRoot.instancePath).toBe('res://prefabs/player.pix3scene');
    expect(instanceRoot.position.x).toBe(10);

    const weapon = instanceRoot.children.find(child => child.nodeId.startsWith('weapon'));
    expect(weapon).toBeDefined();
    expect(weapon?.visible).toBe(false);
  });

  it('remaps component node references to runtime node ids', async () => {
    const prefabText = `
version: 1.0.0
root:
  - id: player-root
    type: Node3D
    components:
      - type: core:PinToNode
        config:
          targetNodeId: weapon
    children:
      - id: weapon
        type: Node3D
`;

    const sceneText = `
version: 1.0.0
root:
  - id: player-instance
    instance: res://prefabs/player.pix3scene
`;

    const loader = createLoader({
      'res://prefabs/player.pix3scene': prefabText,
    });

    const graph = await loader.parseScene(sceneText, { filePath: 'res://scenes/main.pix3scene' });
    const root = graph.rootNodes[0];
    const weapon = root.children.find(child => child.nodeId.startsWith('weapon'));
    expect(weapon).toBeDefined();

    const component = root.components[0] as { targetNodeId?: string };
    expect(component.targetNodeId).toBeDefined();
    expect(component.targetNodeId).toBe(weapon?.nodeId);
  });

  it('serializes instance overrides as root properties + byLocalId child diff', async () => {
    const prefabText = `
version: 1.0.0
root:
  - id: player-root
    type: Node3D
    properties:
      position: { x: 0, y: 0, z: 0 }
    children:
      - id: weapon
        type: Node3D
        properties:
          visible: true
`;

    const sceneText = `
version: 1.0.0
root:
  - id: player-instance
    instance: res://prefabs/player.pix3scene
    properties:
      position: { x: 3, y: 4, z: 5 }
    overrides:
      byLocalId:
        weapon:
          properties:
            visible: false
`;

    const loader = createLoader({
      'res://prefabs/player.pix3scene': prefabText,
    });
    const graph = await loader.parseScene(sceneText, { filePath: 'res://scenes/main.pix3scene' });
    const saver = new SceneSaver();
    const savedText = saver.serializeScene(graph);
    const savedDoc = parseYaml(savedText) as {
      root: Array<{
        properties?: Record<string, unknown>;
        overrides?: { byLocalId: Record<string, { properties?: Record<string, unknown> }> };
        children?: unknown[];
      }>;
    };

    const root = savedDoc.root[0];
    expect(root.children).toBeUndefined();
    expect(root.properties?.position).toEqual({ x: 3, y: 4, z: 5 });
    expect(root.overrides?.byLocalId?.weapon?.properties?.visible).toBe(false);
  });

  it('throws SceneValidationError on cyclical instance dependencies', async () => {
    const loader = createLoader({
      'res://prefabs/a.pix3scene': `
version: 1.0.0
root:
  - id: a-root
    instance: res://prefabs/b.pix3scene
`,
      'res://prefabs/b.pix3scene': `
version: 1.0.0
root:
  - id: b-root
    instance: res://prefabs/a.pix3scene
`,
    });

    const sceneText = `
version: 1.0.0
root:
  - id: top
    instance: res://prefabs/a.pix3scene
`;

    await expect(
      loader.parseScene(sceneText, { filePath: 'res://scenes/main.pix3scene' })
    ).rejects.toBeInstanceOf(SceneValidationError);
  });
});
