import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Group, Scene } from 'three';

import { ViewportRendererService } from './ViewportRendererService';
import { SceneManager } from '../core/scene/SceneManager';

import startupScene from '../services/templates/startup-scene.pix3scene?raw';

const loadGraph = () => {
  const manager = new SceneManager();
  const graph = manager.parseScene(startupScene, { filePath: 'templ://startup-scene' });
  manager.dispose();
  return graph;
};

describe('ViewportRendererService scene loading', () => {
  let service: ViewportRendererService;

  beforeEach(() => {
    service = new ViewportRendererService();
    // Inject stubbed dependencies
    Object.defineProperty(service, 'selectionService', {
      value: {
        initialize: vi.fn(),
        updateSelection: vi.fn(),
        setTransformMode: vi.fn(),
        getTransformMode: vi.fn(() => 'translate'),
        dispose: vi.fn(),
      },
    });
    Object.defineProperty(service, 'sceneContentRoot', {
      value: new Group(),
      configurable: true,
    });
    Object.defineProperty(service, 'mainScene', {
      value: new Scene(),
      configurable: true,
    });
  });

  it('creates mesh with material color from scene graph', () => {
    const graph = loadGraph();

    service.setSceneGraph(graph);

    const root = (service as unknown as { sceneContentRoot: Group }).sceneContentRoot;
    expect(root.children.length).toBeGreaterThan(0);

    const flatten = (group: Group): Group[] => {
      return group.children.reduce<Group[]>((acc, child) => {
        if ('isGroup' in child && child.isGroup) {
          acc.push(child as Group, ...flatten(child as Group));
        }
        return acc;
      }, []);
    };

    const groups = [root, ...flatten(root)];
    const demoContainer = groups.find(child => child.name === 'Demo Box');
    expect(demoContainer).toBeDefined();
    const mesh = demoContainer?.children.find(child => 'isMesh' in child && (child as { isMesh?: boolean }).isMesh === true) as
      | { material: { color: { getHex: () => number } } }
      | undefined;
    expect(mesh).toBeDefined();
    expect(mesh?.material.color.getHex().toString(16)).toBe('ff0000');
  });
});
