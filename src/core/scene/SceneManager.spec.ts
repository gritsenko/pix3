import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SceneManager, SceneValidationError } from './SceneManager';
import { Node3D } from './nodes/Node3D';
import { Sprite2D } from './nodes/Sprite2D';

const SIMPLE_SCENE = `
version: '1.0.0'
root:
  - id: root-node
    type: Node3D
    name: Root Node
    properties:
      position:
        x: 1
        y: 2
        z: 3
      rotation:
        x: 0
        y: 45
        z: 0
      scale:
        x: 1
        y: 2
        z: 1
    children:
      - id: sprite-child
        type: Sprite2D
        name: Sprite Child
        properties:
          position:
            x: 4
            y: 5
          scale:
            x: 2
            y: 3
          rotation: 90
`;

const UPDATED_SCENE = `
version: '1.0.1'
root:
  - id: root-node
    type: Node3D
    name: Root Node
    properties:
      position:
        x: 1
        y: 2
        z: 3
      rotation:
        x: 0
        y: 45
        z: 0
      scale:
        x: 1
        y: 2
        z: 1
    children:
      - id: sprite-child
        type: Sprite2D
        name: Sprite Child Updated
        properties:
          position:
            x: 4
            y: 5
          scale:
            x: 2
            y: 3
          rotation: 45
      - id: new-node
        type: Group
`;

const TRANSFORM_ONLY_SCENE = `
version: '1.0.0'
root:
  - id: demo-box
    type: Node3D
    properties:
      transform:
        position: [1, 2, 3]
        rotationEuler: [10, 20, 30]
        scale: [2, 2, 2]
`;

describe('SceneManager', () => {
  let manager: SceneManager;

  beforeEach(() => {
    manager = new SceneManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  it('parses a valid scene document and instantiates nodes', () => {
    const graph = manager.parseScene(SIMPLE_SCENE, { filePath: 'scenes/example.pix3scene' });

    expect(graph.version).toBe('1.0.0');
    expect(graph.rootNodes).toHaveLength(1);

    const root = graph.rootNodes[0];
    expect(root).toBeInstanceOf(Node3D);
    const root3D = root as Node3D;
    expect(root3D.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(root3D.children).toHaveLength(1);

    const sprite = graph.nodeMap.get('sprite-child');
    expect(sprite).toBeInstanceOf(Sprite2D);
    const sprite2D = sprite as Sprite2D;
    expect(sprite2D.rotation).toBe(90);
    expect(sprite2D.position).toEqual({ x: 4, y: 5 });
    expect(graph.metadata).toEqual({});
  });

  it('normalizes Node3D transforms defined within transform property blocks', () => {
    const graph = manager.parseScene(TRANSFORM_ONLY_SCENE);
    const node = graph.nodeMap.get('demo-box');
    expect(node).toBeInstanceOf(Node3D);

    const node3D = node as Node3D;
    expect(node3D.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(node3D.rotation).toEqual({ x: 10, y: 20, z: 30 });
    expect(node3D.scale).toEqual({ x: 2, y: 2, z: 2 });
    expect(node3D.properties.transform).toBeUndefined();
  });

  it('throws a SceneValidationError when duplicate ids are found', () => {
    const invalidScene = `
version: '1.0.0'
root:
  - id: duplicate
    type: Group
    children:
      - id: duplicate
        type: Group
`;

    expect(() => manager.parseScene(invalidScene, { filePath: 'duplicate.pix3scene' })).toThrow(
      SceneValidationError
    );
  });

  it('computes diffs between scene graphs', () => {
    const previous = manager.parseScene(SIMPLE_SCENE);
    const next = manager.parseScene(UPDATED_SCENE);

    const diff = manager.computeDiff(previous, next);

    expect(diff.added.map(node => node.id)).toContain('new-node');
    expect(diff.removed).toHaveLength(0);
    expect(diff.updated.map(node => node.id)).toContain('sprite-child');
  });

  it('stores and retrieves active scene graphs', () => {
    const graph = manager.parseScene(SIMPLE_SCENE);
    manager.setActiveSceneGraph('sample', graph);

    expect(manager.getActiveSceneGraph()).toBe(graph);
    expect(manager.getSceneGraph('sample')).toBe(graph);

    manager.removeSceneGraph('sample');
    expect(manager.getActiveSceneGraph()).toBeNull();
    expect(manager.getSceneGraph('sample')).toBeNull();
  });
});
