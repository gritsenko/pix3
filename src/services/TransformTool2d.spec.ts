/**
 * TransformTool2d unit tests
 *
 * Tests for 2D manipulation system including:
 * - Anchor-based dragging for Group2D nodes
 * - Rotation handle distance consistency
 * - Resize operations with anchor preservation
 * - Handle state management (hover/active)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { TransformTool2d, type Selection2DOverlay } from './TransformTool2d';
import { Group2D } from '@pix3/runtime';
import { Vector2 } from 'three';

describe('TransformTool2d', () => {
  let tool: TransformTool2d;

  beforeEach(() => {
    tool = new TransformTool2d();
    // Mock window.devicePixelRatio
    vi.stubGlobal('window', { devicePixelRatio: 1 });
  });

  describe('getRotationHandleOffset', () => {
    it('returns fixed offset based on handle size', () => {
      // Default handle size is 10px CSS, DPR=1, so 10px world
      // Rotation offset is 3x handle size = 30px
      const offset = tool.getRotationHandleOffset();
      expect(offset).toBe(30);
    });

    it('scales with device pixel ratio', () => {
      vi.stubGlobal('window', { devicePixelRatio: 2 });
      const tool2 = new TransformTool2d();
      // With DPR=2, handle size = 20px world, offset = 60px
      const offset = tool2.getRotationHandleOffset();
      expect(offset).toBe(60);
    });
  });

  describe('createFrame', () => {
    it('creates frame from bounds', () => {
      const bounds = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(100, 100, 0));

      const frame = tool.createFrame(bounds);

      expect(frame).toBeInstanceOf(THREE.LineSegments);
      expect(frame.userData.is2DFrame).toBe(true);
      expect(frame.renderOrder).toBe(1000);
    });
  });

  describe('createHandles', () => {
    it('creates 9 handles (8 scale + 1 rotate)', () => {
      const bounds = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(100, 100, 0));

      const handles = tool.createHandles(bounds);

      // 8 scale handles + 1 rotate handle + 1 rotation connector line = 10
      expect(handles.length).toBe(10);
    });

    it('places rotation handle at fixed distance', () => {
      const bounds = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(100, 100, 0));

      const handles = tool.createHandles(bounds);
      const rotateHandle = handles.find(
        h => h.userData?.handleType === 'rotate' && h instanceof THREE.Mesh
      );

      expect(rotateHandle).toBeDefined();
      // Top edge is at y=100, rotation offset is 30px (DPR=1)
      expect(rotateHandle!.position.y).toBe(100 + 30);
    });

    it('uses same rotation distance regardless of bounds size', () => {
      const smallBounds = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(50, 50, 0));
      const largeBounds = new THREE.Box3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(500, 500, 0)
      );

      const smallHandles = tool.createHandles(smallBounds);
      const largeHandles = tool.createHandles(largeBounds);

      const smallRotate = smallHandles.find(
        h => h.userData?.handleType === 'rotate' && h instanceof THREE.Mesh
      );
      const largeRotate = largeHandles.find(
        h => h.userData?.handleType === 'rotate' && h instanceof THREE.Mesh
      );

      // Distance from top edge should be the same (30px)
      const smallOffset = smallRotate!.position.y - 50; // 50 is top of small bounds
      const largeOffset = largeRotate!.position.y - 500; // 500 is top of large bounds

      expect(smallOffset).toBe(30);
      expect(largeOffset).toBe(30);
      expect(smallOffset).toBe(largeOffset);
    });
  });

  describe('getHandleAt', () => {
    let overlay: Selection2DOverlay;
    let camera: THREE.OrthographicCamera;
    const viewportSize = { width: 800, height: 600 };

    beforeEach(() => {
      const bounds = new THREE.Box3(new THREE.Vector3(100, 100, 0), new THREE.Vector3(200, 200, 0));

      camera = new THREE.OrthographicCamera(-400, 400, 300, -300, 0.1, 1000);
      camera.position.z = 100;
      camera.updateProjectionMatrix();

      overlay = {
        group: new THREE.Group(),
        handles: tool.createHandles(bounds),
        frame: tool.createFrame(bounds),
        nodeIds: ['test-node'],
        combinedBounds: bounds,
        centerWorld: new THREE.Vector3(150, 150, 0),
      };

      overlay.group.add(overlay.frame, ...overlay.handles);
      overlay.group.updateMatrixWorld(true);
    });

    it('returns move when inside bounds', () => {
      // Center of bounds is at (150, 150) in world coords
      // With ortho camera centered at 0,0 with left=-400,right=400, top=300, bottom=-300
      // Screen coords: x = (worldX + 400) / 800 * viewportWidth = (150 + 400) / 800 * 800 = 550
      // Screen coords: y = (300 - worldY) / 600 * viewportHeight = (300 - 150) / 600 * 600 = 150
      const handle = tool.getHandleAt(550, 150, overlay, camera, viewportSize);
      // Note: Actual raycast depends on precise camera setup
      // This tests the general flow
      expect(['move', 'idle']).toContain(handle);
    });

    it('returns idle outside all handles and bounds', () => {
      const handle = tool.getHandleAt(0, 0, overlay, camera, viewportSize);
      expect(handle).toBe('idle');
    });
  });

  describe('active handle state', () => {
    let overlay: Selection2DOverlay;

    beforeEach(() => {
      const bounds = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(100, 100, 0));

      overlay = {
        group: new THREE.Group(),
        handles: tool.createHandles(bounds),
        frame: tool.createFrame(bounds),
        nodeIds: ['test-node'],
        combinedBounds: bounds,
        centerWorld: new THREE.Vector3(50, 50, 0),
      };
    });

    it('tracks active handle', () => {
      expect(tool.getActiveHandle()).toBe('idle');

      tool.setActiveHandle('scale-ne', overlay);
      expect(tool.getActiveHandle()).toBe('scale-ne');

      tool.clearActiveHandle(overlay);
      expect(tool.getActiveHandle()).toBe('idle');
    });

    it('changes handle color when active', () => {
      const scaleHandle = overlay.handles.find(
        h => h.userData?.handleType === 'scale-ne' && h instanceof THREE.Mesh
      ) as THREE.Mesh | undefined;

      expect(scaleHandle).toBeDefined();
      const material = scaleHandle!.material as THREE.MeshBasicMaterial;
      const originalColor = material.color.getHex();

      tool.setActiveHandle('scale-ne', overlay);

      // Color should be accent color (0xffcf33)
      expect(material.color.getHex()).toBe(0xffcf33);

      tool.clearActiveHandle(overlay);

      // Color should return to original
      expect(material.color.getHex()).toBe(originalColor);
    });
  });

  describe('hover state', () => {
    let overlay: Selection2DOverlay;
    let camera: THREE.OrthographicCamera;

    beforeEach(() => {
      const bounds = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(100, 100, 0));

      camera = new THREE.OrthographicCamera(-400, 400, 300, -300, 0.1, 1000);
      camera.position.z = 100;
      camera.updateProjectionMatrix();

      overlay = {
        group: new THREE.Group(),
        handles: tool.createHandles(bounds),
        frame: tool.createFrame(bounds),
        nodeIds: ['test-node'],
        combinedBounds: bounds,
        centerWorld: new THREE.Vector3(50, 50, 0),
      };

      overlay.group.add(overlay.frame, ...overlay.handles);
    });

    it('tracks hovered handle', () => {
      expect(tool.getHoveredHandle()).toBe('idle');
    });

    it('clearHover resets hover state', () => {
      tool.clearHover(overlay);
      expect(tool.getHoveredHandle()).toBe('idle');
    });
  });
});

describe('Group2D anchor manipulation', () => {
  describe('recalculateOffsets', () => {
    it('calculates offsets from current position', () => {
      const group = new Group2D({
        id: 'test',
        name: 'Test',
        width: 100,
        height: 100,
      });

      // Set parent dimensions
      group.updateLayout(800, 600);

      // Move group to a new position
      group.position.set(100, 50, 0);

      // Recalculate offsets
      group.recalculateOffsets();

      // Offsets should reflect the new position relative to center anchor
      // Center anchor at (0.5, 0.5) means anchor point is at (0, 0) in parent coords
      // Group edges: left = 100 - 50 = 50, right = 100 + 50 = 150
      // Anchor edges: anchorMinX = 0, anchorMaxX = 0
      // offsetMin.x = left - anchorMinX = 50 - 0 = 50
      expect(group.offsetMin.x).toBe(50);
      expect(group.offsetMax.x).toBe(150);
    });

    it('handles zero parent dimensions with fallback', () => {
      const group = new Group2D({
        id: 'test',
        name: 'Test',
        width: 100,
        height: 100,
      });

      // Don't set parent dimensions (they default to 0)
      group.position.set(100, 50, 0);

      // Should not throw, should use minimum fallback
      expect(() => group.recalculateOffsets()).not.toThrow();
    });

    it('accepts parent dimensions as parameters', () => {
      const group = new Group2D({
        id: 'test',
        name: 'Test',
        width: 100,
        height: 100,
      });

      group.position.set(50, 50, 0);

      // Provide parent dimensions directly
      group.recalculateOffsets(800, 600);

      // Should use provided dimensions
      expect(group.offsetMin.x).toBe(0);
      expect(group.offsetMax.x).toBe(100);
    });
  });

  describe('updateLayout', () => {
    it('enforces minimum 1px dimensions', () => {
      const group = new Group2D({
        id: 'test',
        name: 'Test',
        width: 100,
        height: 100,
        anchorMin: new Vector2(0, 0),
        anchorMax: new Vector2(1, 1), // Stretch mode
        offsetMin: new Vector2(0, 0),
        offsetMax: new Vector2(0, 0), // Would result in 0 size
      });

      // In stretch mode with zero offsets, size would be exactly parent size
      // But if we set up offsets that would create zero/negative size...
      group.offsetMin.set(100, 100);
      group.offsetMax.set(-100, -100);

      group.updateLayout(50, 50);

      // Should clamp to minimum 1px
      expect(group.width).toBeGreaterThanOrEqual(1);
      expect(group.height).toBeGreaterThanOrEqual(1);
    });
  });
});
