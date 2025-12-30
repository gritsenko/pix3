/**
 * Tests for ScriptRegistry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScriptRegistry } from './ScriptRegistry';
import { BehaviorBase, ScriptControllerBase } from '@/core/ScriptComponent';
import type { PropertySchema } from '@/fw';

// Test behavior class
class TestBehavior extends BehaviorBase {
  static getPropertySchema(): PropertySchema {
    return {
      nodeType: 'TestBehavior',
      properties: [
        {
          name: 'speed',
          type: 'number',
          getValue: (b) => (b as TestBehavior).parameters.speed,
          setValue: (b, v) => {
            (b as TestBehavior).parameters.speed = v;
          },
        },
      ],
    };
  }
}

// Test controller class
class TestController extends ScriptControllerBase {
  static getPropertySchema(): PropertySchema {
    return {
      nodeType: 'TestController',
      properties: [
        {
          name: 'maxSpeed',
          type: 'number',
          getValue: (c) => (c as TestController).parameters.maxSpeed,
          setValue: (c, v) => {
            (c as TestController).parameters.maxSpeed = v;
          },
        },
      ],
    };
  }
}

describe('ScriptRegistry', () => {
  let registry: ScriptRegistry;

  beforeEach(() => {
    registry = new ScriptRegistry();
  });

  describe('registerBehavior', () => {
    it('should register a behavior type', () => {
      registry.registerBehavior({
        id: 'test_behavior',
        displayName: 'Test Behavior',
        description: 'A test behavior',
        category: 'Test',
        behaviorClass: TestBehavior,
        keywords: ['test'],
      });

      const type = registry.getBehaviorType('test_behavior');
      expect(type).toBeDefined();
      expect(type?.displayName).toBe('Test Behavior');
    });

    it('should warn on duplicate registration', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      registry.registerBehavior({
        id: 'test_behavior',
        displayName: 'Test Behavior',
        description: 'A test behavior',
        category: 'Test',
        behaviorClass: TestBehavior,
        keywords: ['test'],
      });

      registry.registerBehavior({
        id: 'test_behavior',
        displayName: 'Test Behavior 2',
        description: 'Another test behavior',
        category: 'Test',
        behaviorClass: TestBehavior,
        keywords: ['test'],
      });

      expect(consoleWarnSpy).toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('registerController', () => {
    it('should register a controller type', () => {
      registry.registerController({
        id: 'test_controller',
        displayName: 'Test Controller',
        description: 'A test controller',
        category: 'Test',
        controllerClass: TestController,
        keywords: ['test'],
      });

      const type = registry.getControllerType('test_controller');
      expect(type).toBeDefined();
      expect(type?.displayName).toBe('Test Controller');
    });
  });

  describe('createBehavior', () => {
    beforeEach(() => {
      registry.registerBehavior({
        id: 'test_behavior',
        displayName: 'Test Behavior',
        description: 'A test behavior',
        category: 'Test',
        behaviorClass: TestBehavior,
        keywords: ['test'],
      });
    });

    it('should create a behavior instance', () => {
      const behavior = registry.createBehavior('test_behavior', 'instance-1');
      expect(behavior).toBeDefined();
      expect(behavior?.id).toBe('instance-1');
      expect(behavior?.type).toBe('test_behavior');
    });

    it('should return null for unknown behavior type', () => {
      const behavior = registry.createBehavior('unknown', 'instance-1');
      expect(behavior).toBeNull();
    });
  });

  describe('createController', () => {
    beforeEach(() => {
      registry.registerController({
        id: 'test_controller',
        displayName: 'Test Controller',
        description: 'A test controller',
        category: 'Test',
        controllerClass: TestController,
        keywords: ['test'],
      });
    });

    it('should create a controller instance', () => {
      const controller = registry.createController('test_controller', 'instance-1');
      expect(controller).toBeDefined();
      expect(controller?.id).toBe('instance-1');
      expect(controller?.type).toBe('test_controller');
    });

    it('should return null for unknown controller type', () => {
      const controller = registry.createController('unknown', 'instance-1');
      expect(controller).toBeNull();
    });
  });

  describe('getBehaviorPropertySchema', () => {
    beforeEach(() => {
      registry.registerBehavior({
        id: 'test_behavior',
        displayName: 'Test Behavior',
        description: 'A test behavior',
        category: 'Test',
        behaviorClass: TestBehavior,
        keywords: ['test'],
      });
    });

    it('should return property schema for a behavior', () => {
      const schema = registry.getBehaviorPropertySchema('test_behavior');
      expect(schema).toBeDefined();
      expect(schema?.nodeType).toBe('TestBehavior');
      expect(schema?.properties).toHaveLength(1);
      expect(schema?.properties[0].name).toBe('speed');
    });

    it('should return null for unknown behavior type', () => {
      const schema = registry.getBehaviorPropertySchema('unknown');
      expect(schema).toBeNull();
    });
  });

  describe('getControllerPropertySchema', () => {
    beforeEach(() => {
      registry.registerController({
        id: 'test_controller',
        displayName: 'Test Controller',
        description: 'A test controller',
        category: 'Test',
        controllerClass: TestController,
        keywords: ['test'],
      });
    });

    it('should return property schema for a controller', () => {
      const schema = registry.getControllerPropertySchema('test_controller');
      expect(schema).toBeDefined();
      expect(schema?.nodeType).toBe('TestController');
      expect(schema?.properties).toHaveLength(1);
      expect(schema?.properties[0].name).toBe('maxSpeed');
    });

    it('should return null for unknown controller type', () => {
      const schema = registry.getControllerPropertySchema('unknown');
      expect(schema).toBeNull();
    });
  });

  describe('searchBehaviors', () => {
    beforeEach(() => {
      registry.registerBehavior({
        id: 'rotate',
        displayName: 'Rotate',
        description: 'Rotates an object',
        category: 'Animation',
        behaviorClass: TestBehavior,
        keywords: ['rotate', 'animation'],
      });

      registry.registerBehavior({
        id: 'move',
        displayName: 'Move',
        description: 'Moves an object',
        category: 'Animation',
        behaviorClass: TestBehavior,
        keywords: ['move', 'translate'],
      });
    });

    it('should find behaviors by display name', () => {
      const results = registry.searchBehaviors('rotate');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('rotate');
    });

    it('should find behaviors by description', () => {
      const results = registry.searchBehaviors('moves');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('move');
    });

    it('should find behaviors by keyword', () => {
      const results = registry.searchBehaviors('animation');
      // Both behaviors have 'animation' in their keywords or description
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('should return empty array for no matches', () => {
      const results = registry.searchBehaviors('xyz');
      expect(results).toHaveLength(0);
    });
  });

  describe('getAllBehaviorTypes', () => {
    it('should return all registered behavior types', () => {
      registry.registerBehavior({
        id: 'behavior1',
        displayName: 'Behavior 1',
        description: 'First behavior',
        category: 'Test',
        behaviorClass: TestBehavior,
        keywords: [],
      });

      registry.registerBehavior({
        id: 'behavior2',
        displayName: 'Behavior 2',
        description: 'Second behavior',
        category: 'Test',
        behaviorClass: TestBehavior,
        keywords: [],
      });

      const types = registry.getAllBehaviorTypes();
      expect(types).toHaveLength(2);
    });
  });

  describe('dispose', () => {
    it('should clear all registered types', () => {
      registry.registerBehavior({
        id: 'test',
        displayName: 'Test',
        description: 'Test',
        category: 'Test',
        behaviorClass: TestBehavior,
        keywords: [],
      });

      registry.dispose();

      expect(registry.getAllBehaviorTypes()).toHaveLength(0);
      expect(registry.getAllControllerTypes()).toHaveLength(0);
    });
  });
});
