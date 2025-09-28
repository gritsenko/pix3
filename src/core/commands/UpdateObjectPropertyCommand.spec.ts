import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UpdateObjectPropertyCommand } from './UpdateObjectPropertyCommand';
import { appState, getAppStateSnapshot, resetAppState } from '../../state';
import { createCommandContext } from './command';
import { SceneManager } from '../scene/SceneManager';
import { ServiceContainer, ServiceLifetime } from '../../fw/di';
import { Node3D } from '../scene/nodes/Node3D';
import { Sprite2D } from '../scene/nodes/Sprite2D';
import type { SceneGraph } from '../scene/types';

const buildContext = () => createCommandContext(appState, getAppStateSnapshot());

describe('UpdateObjectPropertyCommand', () => {
  let sceneManager: SceneManager;
  let mockSceneGraph: SceneGraph;
  let testNode3D: Node3D;
  let testSprite2D: Sprite2D;

  beforeEach(() => {
    resetAppState();
    
    // Create a mock scene manager class
    class MockSceneManager {
      getActiveSceneGraph = vi.fn();
      setActiveSceneGraph = vi.fn();
      parseScene = vi.fn();
      removeSceneGraph = vi.fn();
      dispose = vi.fn();
    }
    
    sceneManager = new MockSceneManager() as unknown as SceneManager;

    // Create fresh test nodes for each test
    testNode3D = new Node3D({
      id: 'test-node-3d',
      name: 'Test Node 3D',
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 45, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });
    testNode3D.properties.visible = true;

    testSprite2D = new Sprite2D({
      id: 'test-sprite-2d',
      name: 'Test Sprite 2D',
      position: { x: 10, y: 20 },
      scale: { x: 2, y: 2 },
    });
    testSprite2D.properties.visible = false;

    // Create mock scene graph
    const nodeMap = new Map<string, any>();
    nodeMap.set('test-node-3d', testNode3D);
    nodeMap.set('test-sprite-2d', testSprite2D);
    
    mockSceneGraph = {
      version: '1.0.0',
      description: 'Test scene',
      rootNodes: [testNode3D, testSprite2D],
      nodeMap: nodeMap,
      metadata: {},
    };

    // Mock the scene manager to return our test scene graph
    vi.mocked(sceneManager.getActiveSceneGraph).mockReturnValue(mockSceneGraph);

    // Register the mocked scene manager in the DI container
    const container = ServiceContainer.getInstance();
    const token = container.getOrCreateToken(SceneManager);
    // Create a constructor function that returns our mock instance
    const MockSceneManagerConstructor = vi.fn(() => sceneManager);
    container.addService(token, MockSceneManagerConstructor, ServiceLifetime.Singleton);
  });

  describe('preconditions', () => {
    it('allows execution when node exists and property is valid', () => {
      const command = new UpdateObjectPropertyCommand({
        nodeId: 'test-node-3d',
        propertyPath: 'position.x',
        value: 5,
      });

      const result = command.preconditions(buildContext());
      expect(result.canExecute).toBe(true);
    });

    it('blocks execution when no active scene', () => {
      vi.mocked(sceneManager.getActiveSceneGraph).mockReturnValue(null);

      const command = new UpdateObjectPropertyCommand({
        nodeId: 'test-node-3d',
        propertyPath: 'position.x',
        value: 5,
      });

      const result = command.preconditions(buildContext());
      expect(result.canExecute).toBe(false);
      if (!result.canExecute) {
        expect(result.reason).toBe('No active scene available');
        expect(result.scope).toBe('scene');
      }
    });

    it('blocks execution when node does not exist', () => {
      const command = new UpdateObjectPropertyCommand({
        nodeId: 'non-existent-node',
        propertyPath: 'position.x',
        value: 5,
      });

      const result = command.preconditions(buildContext());
      expect(result.canExecute).toBe(false);
      if (!result.canExecute) {
        expect(result.reason).toBe("Node with ID 'non-existent-node' not found in active scene");
        expect(result.scope).toBe('selection');
      }
    });

    it('blocks execution for invalid property paths', () => {
      const command = new UpdateObjectPropertyCommand({
        nodeId: 'test-node-3d',
        propertyPath: 'invalid.property.path',
        value: 5,
      });

      const result = command.preconditions(buildContext());
      expect(result.canExecute).toBe(false);
      if (!result.canExecute) {
        expect(result.reason).toBe('Property path is too deep');
      }
    });

    it('blocks execution for invalid transform values', () => {
      const command = new UpdateObjectPropertyCommand({
        nodeId: 'test-node-3d',
        propertyPath: 'position.x',
        value: 'not-a-number',
      });

      const result = command.preconditions(buildContext());
      expect(result.canExecute).toBe(false);
      if (!result.canExecute) {
        expect(result.reason).toBe('Transform properties must be finite numbers');
      }
    });

    it('blocks execution for invalid scale values', () => {
      const command = new UpdateObjectPropertyCommand({
        nodeId: 'test-node-3d',
        propertyPath: 'scale.x',
        value: 0,
      });

      const result = command.preconditions(buildContext());
      expect(result.canExecute).toBe(false);
      if (!result.canExecute) {
        expect(result.reason).toBe('Scale values must be greater than 0');
      }
    });

    it('blocks execution for Sprite2D with unsupported transform properties', () => {
      const command = new UpdateObjectPropertyCommand({
        nodeId: 'test-sprite-2d',
        propertyPath: 'position.z',
        value: 5,
      });

      const result = command.preconditions(buildContext());
      expect(result.canExecute).toBe(false);
      if (!result.canExecute) {
        expect(result.reason).toBe('Sprite2D does not support position.z');
      }
    });
  });

  describe('execute', () => {
    it('updates Node3D position properties correctly', () => {
      const command = new UpdateObjectPropertyCommand({
        nodeId: 'test-node-3d',
        propertyPath: 'position.x',
        value: 10,
      });

      const result = command.execute(buildContext());

      expect(result.didMutate).toBe(true);
      expect(result.payload.nodeId).toBe('test-node-3d');
      expect(result.payload.propertyPath).toBe('position.x');
      expect(result.payload.newValue).toBe(10);
      expect(result.payload.previousValue).toBe(1);
      expect(testNode3D.position.x).toBe(10);
    });

    it('updates Node3D rotation properties correctly (stored in degrees)', () => {
      const command = new UpdateObjectPropertyCommand({
        nodeId: 'test-node-3d',
        propertyPath: 'rotation.y',
        value: 90,
      });

      const result = command.execute(buildContext());

      expect(result.didMutate).toBe(true);
      expect(result.payload.newValue).toBe(90);
      expect(result.payload.previousValue).toBe(45);
      expect(testNode3D.rotation.y).toBe(90);
    });

    it('updates Node3D scale properties correctly', () => {
      const command = new UpdateObjectPropertyCommand({
        nodeId: 'test-node-3d',
        propertyPath: 'scale.y',
        value: 2.5,
      });

      const result = command.execute(buildContext());

      expect(result.didMutate).toBe(true);
      expect(result.payload.newValue).toBe(2.5);
      expect(result.payload.previousValue).toBe(1);
      expect(testNode3D.scale.y).toBe(2.5);
    });

    it('updates visibility property correctly', () => {
      const command = new UpdateObjectPropertyCommand({
        nodeId: 'test-node-3d',
        propertyPath: 'visible',
        value: false,
      });

      const result = command.execute(buildContext());

      expect(result.didMutate).toBe(true);
      expect(result.payload.newValue).toBe(false);
      expect(result.payload.previousValue).toBe(true);
      expect(testNode3D.properties.visible).toBe(false);
    });

    it('updates name property correctly', () => {
      const command = new UpdateObjectPropertyCommand({
        nodeId: 'test-node-3d',
        propertyPath: 'name',
        value: 'Updated Name',
      });

      const result = command.execute(buildContext());

      expect(result.didMutate).toBe(true);
      expect(result.payload.newValue).toBe('Updated Name');
      expect(result.payload.previousValue).toBe('Test Node 3D');
      expect(testNode3D.name).toBe('Updated Name');
    });

    it('updates Sprite2D position properties correctly', () => {
      const command = new UpdateObjectPropertyCommand({
        nodeId: 'test-sprite-2d',
        propertyPath: 'position.x',
        value: 50,
      });

      const result = command.execute(buildContext());

      expect(result.didMutate).toBe(true);
      expect(result.payload.newValue).toBe(50);
      expect(result.payload.previousValue).toBe(10);
      expect(testSprite2D.position.x).toBe(50);
    });

    it('updates Sprite2D rotation correctly (z-axis only)', () => {
      const command = new UpdateObjectPropertyCommand({
        nodeId: 'test-sprite-2d',
        propertyPath: 'rotation.z',
        value: 45,
      });

      const result = command.execute(buildContext());

      expect(result.didMutate).toBe(true);
      expect(result.payload.newValue).toBe(45);
      expect((testSprite2D as any).rotation).toBe(45);
    });

    it('throws error when node is not found', () => {
      const command = new UpdateObjectPropertyCommand({
        nodeId: 'non-existent-node',
        propertyPath: 'position.x',
        value: 5,
      });
      
      expect(() => command.execute(buildContext())).toThrow("Node with ID 'non-existent-node' not found in active scene");
    });

    it('throws error when no active scene', () => {
      vi.mocked(sceneManager.getActiveSceneGraph).mockReturnValue(null);
      
      const command = new UpdateObjectPropertyCommand({
        nodeId: 'test-node-3d',
        propertyPath: 'position.x',
        value: 5,
      });
      
      expect(() => command.execute(buildContext())).toThrow('No active scene available');
    });
  });

  describe('postCommit', () => {
    it('returns correct undo payload', () => {
      const command = new UpdateObjectPropertyCommand({
        nodeId: 'test-node-3d',
        propertyPath: 'position.x',
        value: 10,
      });

      const executeResult = command.execute(buildContext());
      const undoPayload = command.postCommit(buildContext(), executeResult.payload);

      expect(undoPayload.nodeId).toBe('test-node-3d');
      expect(undoPayload.propertyPath).toBe('position.x');
      expect(undoPayload.previousValue).toBe(1);
    });
  });
});