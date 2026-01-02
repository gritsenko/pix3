/**
 * Tests for the unified ScriptComponent system
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NodeBase } from '@/nodes/NodeBase';
import { Script, type ScriptComponent } from '@/core/ScriptComponent';

// Test component implementation
class TestComponent extends Script {
  updateCount = 0;
  startCalled = false;
  attachCalled = false;
  detachCalled = false;

  override onAttach(node: NodeBase): void {
    this.attachCalled = true;
  }

  override onStart(): void {
    this.startCalled = true;
  }

  override onUpdate(dt: number): void {
    this.updateCount++;
  }

  override onDetach(): void {
    this.detachCalled = true;
  }
}

describe('Unified Component System', () => {
  let node: NodeBase;
  let component: TestComponent;

  beforeEach(() => {
    node = new NodeBase({ id: 'test-node', name: 'Test Node' });
    component = new TestComponent('test-component-1', 'TestComponent');
  });

  describe('NodeBase.addComponent', () => {
    it('should add a component to the node', () => {
      node.addComponent(component);
      expect(node.components).toContain(component);
      expect(component.node).toBe(node);
    });

    it('should call onAttach when component is added', () => {
      node.addComponent(component);
      expect(component.attachCalled).toBe(true);
    });

    it('should not add duplicate components', () => {
      node.addComponent(component);
      node.addComponent(component);
      expect(node.components.length).toBe(1);
    });
  });

  describe('NodeBase.removeComponent', () => {
    it('should remove a component from the node', () => {
      node.addComponent(component);
      node.removeComponent(component);
      expect(node.components).not.toContain(component);
      expect(component.node).toBeNull();
    });

    it('should call onDetach when component is removed', () => {
      node.addComponent(component);
      node.removeComponent(component);
      expect(component.detachCalled).toBe(true);
    });

    it('should reset started state when removed', () => {
      node.addComponent(component);
      component._started = true;
      node.removeComponent(component);
      expect(component._started).toBe(false);
    });
  });

  describe('NodeBase.getComponent', () => {
    it('should find a component by type', () => {
      node.addComponent(component);
      const found = node.getComponent(TestComponent);
      expect(found).toBe(component);
    });

    it('should return null if component not found', () => {
      const found = node.getComponent(TestComponent);
      expect(found).toBeNull();
    });
  });

  describe('NodeBase.tick', () => {
    it('should call onStart on first tick', () => {
      node.addComponent(component);
      node.tick(0.016);
      expect(component.startCalled).toBe(true);
    });

    it('should call onUpdate every tick', () => {
      node.addComponent(component);
      node.tick(0.016);
      node.tick(0.016);
      node.tick(0.016);
      expect(component.updateCount).toBe(3);
    });

    it('should not update disabled components', () => {
      node.addComponent(component);
      component.enabled = false;
      node.tick(0.016);
      expect(component.startCalled).toBe(false);
      expect(component.updateCount).toBe(0);
    });

    it('should update children nodes', () => {
      const childNode = new NodeBase({ id: 'child-node', name: 'Child Node' });
      const childComponent = new TestComponent('child-component', 'TestComponent');
      childNode.addComponent(childComponent);
      node.adoptChild(childNode);

      node.tick(0.016);
      expect(childComponent.updateCount).toBe(1);
    });
  });

  describe('ScriptComponent interface', () => {
    it('should have required properties', () => {
      expect(component.id).toBe('test-component-1');
      expect(component.type).toBe('TestComponent');
      expect(component.enabled).toBe(true);
      expect(component.config).toBeDefined();
      expect(component._started).toBe(false);
    });

    it('should support config object', () => {
      component.config = { speed: 10, color: 'red' };
      expect(component.config.speed).toBe(10);
      expect(component.config.color).toBe('red');
    });
  });

  describe('Backward compatibility', () => {
    it('should expose behaviors getter', () => {
      node.addComponent(component);
      expect(node.behaviors).toBeDefined();
      expect(Array.isArray(node.behaviors)).toBe(true);
    });

    it('should expose controller getter/setter', () => {
      const controllerComponent = new TestComponent('controller', 'Controller');
      node.controller = controllerComponent as any;
      expect(node.controller).toBe(controllerComponent);
      expect(node.components).toContain(controllerComponent);
    });
  });
});
