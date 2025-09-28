import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Group, Scene } from 'three';

import { ViewportRendererService } from './ViewportRendererService';
import { SceneManager } from '../scene/SceneManager';

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
    // Create a new instance for each test since it's now a singleton
    service = new ViewportRendererService();
    // Manually dispose and reset for clean test state
    service.dispose();

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
    expect(service.hasActiveSceneGraph()).toBe(true);

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
    const mesh = demoContainer?.children.find(
      child => 'isMesh' in child && (child as { isMesh?: boolean }).isMesh === true
    ) as { material: { color: { getHex: () => number } } } | undefined;
    expect(mesh).toBeDefined();
    expect(mesh?.material.color.getHex().toString(16)).toBe('ff00ff');
  });

  it('rebuilds scene content when graph set before scene root exists', () => {
    const graph = loadGraph();

    // Simulate state before initialize (no root/main scene yet)
    Object.defineProperty(service, 'sceneContentRoot', { value: null, configurable: true });
    Object.defineProperty(service, 'mainScene', { value: null, configurable: true });

    service.setSceneGraph(graph);
    expect(service.hasActiveSceneGraph()).toBe(true);

    // Later, initialization provides scene root and main scene; re-sync should build content
    const root = new Group();
    const mainScene = new Scene();
    Object.defineProperty(service, 'sceneContentRoot', { value: root, configurable: true });
    Object.defineProperty(service, 'mainScene', { value: mainScene, configurable: true });

    const sync = (service as unknown as { syncSceneContent: () => void }).syncSceneContent;
    sync.call(service);

    expect(root.children.length).toBeGreaterThan(0);
    const findByName = (group: Group, name: string): Group | undefined => {
      if (group.name === name) {
        return group;
      }
      for (const child of group.children) {
        if ('isGroup' in child && child.isGroup) {
          const match = findByName(child as Group, name);
          if (match) {
            return match;
          }
        }
      }
      return undefined;
    };

    const demoContainer = findByName(root, 'Demo Box');
    expect(demoContainer).toBeDefined();
    const fallback = findByName(root, 'Fallback Demo Mesh');
    expect(fallback).toBeUndefined();
  });
});
