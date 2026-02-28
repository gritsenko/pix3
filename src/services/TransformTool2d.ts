/**
 * TransformTool2d - Handles 2D object transformation (move, rotate, scale)
 *
 * Encapsulates all 2D transform logic including:
 * - Selection frame and handle geometry creation
 * - Handle detection from screen coordinates
 * - Transform state tracking and updates
 * - Anchor point calculations for scale operations
 */

import * as THREE from 'three';
import { Node2D, Group2D } from '@pix3/runtime';
import type { SceneGraph } from '@pix3/runtime';

export type TwoDHandle =
  | 'idle'
  | 'move'
  | 'rotate'
  | 'scale-n'
  | 'scale-s'
  | 'scale-e'
  | 'scale-w'
  | 'scale-ne'
  | 'scale-nw'
  | 'scale-se'
  | 'scale-sw';

export interface Transform2DState {
  position: THREE.Vector3;
  rotation: number;
  scale: THREE.Vector2;
  width?: number;
  height?: number;
  worldPosition?: THREE.Vector3;
  worldRotationZ?: number;
  // Anchor data for Group2D nodes (for real-time offset updates during drag)
  offsetMin?: THREE.Vector2;
  offsetMax?: THREE.Vector2;
  parentWidth?: number;
  parentHeight?: number;
}

export interface Selection2DOverlay {
  group: THREE.Group;
  handles: THREE.Object3D[];
  frame: THREE.LineSegments;
  nodeIds: string[];
  combinedBounds: THREE.Box3;
  centerWorld: THREE.Vector3;
  rotationHandle?: THREE.Object3D;
}

export interface Active2DTransform {
  nodeIds: string[];
  handle: TwoDHandle;
  startPointerWorld: THREE.Vector3;
  startStates: Map<string, Transform2DState>;
  combinedBounds: THREE.Box3;
  startCenterWorld: THREE.Vector3;
  anchorWorld: THREE.Vector3;
  anchorLocal: THREE.Vector3;
  startSize: THREE.Vector2;
}

export class TransformTool2d {
  private readonly min2DSizeCssPx = 4;
  private readonly handleSizeCssPx = 10;
  /** Extra CSS-pixel margin around handles for pointer hit testing */
  private readonly handleHitMarginCssPx = 4;
  /** Radius of handle corners in CSS pixels */
  private readonly handleCornerRadiusCssPx = 3;

  // Handle colors
  private readonly scaleHandleColor = 0x4e8df5;
  private readonly scaleHandleBorderColor = 0xffffff; // White contrast border
  private readonly scaleHandleHoverColor = 0xffffff; // White for obvious hover
  private readonly scaleHandleActiveColor = 0xffcf33; // Accent color for active drag
  private readonly rotateHandleColor = 0xf5b64e;
  private readonly rotateHandleBorderColor = 0xffffff; // White contrast border
  private readonly rotateHandleHoverColor = 0xffffff; // White for obvious hover
  private readonly rotateHandleActiveColor = 0xffcf33; // Accent color for active drag

  // Currently hovered handle (for visual feedback)
  private hoveredHandle: TwoDHandle = 'idle';
  // Currently active/dragging handle
  private activeHandle: TwoDHandle = 'idle';

  private setNodeWorldPosition(node: Node2D, worldPosition: THREE.Vector3): void {
    const parent = node.parent as THREE.Object3D | null;
    if (parent) {
      parent.updateWorldMatrix(true, false);
      const local = worldPosition.clone();
      parent.worldToLocal(local);
      node.position.set(local.x, local.y, node.position.z);
      return;
    }
    node.position.set(worldPosition.x, worldPosition.y, node.position.z);
  }

  private setNodeWorldRotationZ(node: Node2D, worldRotationZ: number): void {
    const parent = node.parent as THREE.Object3D | null;
    if (!parent) {
      node.rotation.set(0, 0, worldRotationZ);
      return;
    }

    parent.updateWorldMatrix(true, false);
    const parentQuat = parent.getWorldQuaternion(new THREE.Quaternion());
    const parentEuler = new THREE.Euler().setFromQuaternion(parentQuat, 'XYZ');
    node.rotation.set(0, 0, worldRotationZ - parentEuler.z);
  }

  /**
   * Update Group2D offsets during drag to maintain proper anchor-relative positioning.
   * This provides real-time preview by directly computing offsets from the delta.
   */
  private updateGroup2DOffsetsDuringDrag(
    node: Group2D,
    startState: Transform2DState,
    worldDelta: THREE.Vector3
  ): void {
    // Convert world delta to local delta (accounting for parent rotation/scale)
    const parent = node.parent as THREE.Object3D | null;
    let localDeltaX = worldDelta.x;
    let localDeltaY = worldDelta.y;

    if (parent) {
      // Get parent's inverse world matrix to convert delta to parent-local space
      parent.updateWorldMatrix(true, false);
      const parentMatrix = parent.matrixWorld.clone();
      // We only need rotation and scale (not translation) for delta conversion
      parentMatrix.setPosition(0, 0, 0);
      const localDelta = new THREE.Vector3(worldDelta.x, worldDelta.y, 0).applyMatrix4(
        parentMatrix.clone().invert()
      );
      localDeltaX = localDelta.x;
      localDeltaY = localDelta.y;
    }

    // Apply delta to start offsets
    if (startState.offsetMin && startState.offsetMax) {
      node.offsetMin.set(
        startState.offsetMin.x + localDeltaX,
        startState.offsetMin.y + localDeltaY
      );
      node.offsetMax.set(
        startState.offsetMax.x + localDeltaX,
        startState.offsetMax.y + localDeltaY
      );
    }
  }

  private getDpr(): number {
    // Keep 2D overlay sizing stable in CSS pixels; the ortho camera uses physical pixels.
    return typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
  }

  private getMin2DSizeWorldPx(): number {
    return this.min2DSizeCssPx * this.getDpr();
  }

  private getHandleSizeWorldPx(): number {
    return this.handleSizeCssPx * this.getDpr();
  }

  /**
   * Helper to generate a rounded-rectangle geometry in pixel space. Size and radius
   * are expressed in the same units (world/physical pixels). The shape is centered
   * at the origin.
   */
  private createRoundedRectGeometry(size: number, radius: number): THREE.ShapeGeometry {
    const half = size / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-half + radius, -half);
    shape.lineTo(half - radius, -half);
    shape.quadraticCurveTo(half, -half, half, -half + radius);
    shape.lineTo(half, half - radius);
    shape.quadraticCurveTo(half, half, half - radius, half);
    shape.lineTo(-half + radius, half);
    shape.quadraticCurveTo(-half, half, -half, half - radius);
    shape.lineTo(-half, -half + radius);
    shape.quadraticCurveTo(-half, -half, -half + radius, -half);
    const geom = new THREE.ShapeGeometry(shape);
    geom.computeBoundingBox();
    return geom;
  }

  /**
   * Get the fixed rotation handle offset (public for consistency in ViewportRenderService)
   */
  getRotationHandleOffset(): number {
    return this.getHandleSizeWorldPx() * 3;
  }

  /**
   * Create a selection frame (rectangle outline) for 2D objects
   */
  createFrame(bounds: THREE.Box3): THREE.LineSegments {
    const min = bounds.min;
    const max = bounds.max;
    const z = (min.z + max.z) / 2;
    const points = [
      new THREE.Vector3(min.x, min.y, z),
      new THREE.Vector3(max.x, min.y, z),
      new THREE.Vector3(max.x, min.y, z),
      new THREE.Vector3(max.x, max.y, z),
      new THREE.Vector3(max.x, max.y, z),
      new THREE.Vector3(min.x, max.y, z),
      new THREE.Vector3(min.x, max.y, z),
      new THREE.Vector3(min.x, min.y, z),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.computeBoundingBox();

    const material = new THREE.LineBasicMaterial({
      color: 0x4e8df5,
      linewidth: 1,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    });
    const frame = new THREE.LineSegments(geometry, material);
    frame.userData.is2DFrame = true;
    frame.renderOrder = 1000;
    frame.layers.set(1);
    return frame;
  }

  /**
   * Create a single handle group: filled square with a contrast border outline.
   */
  private createHandleGroup(
    handleSize: number,
    fillColor: number,
    borderColor: number,
    type: string,
    position: THREE.Vector3,
    cornerRadius: number
  ): THREE.Group {
    const group = new THREE.Group();
    group.position.copy(position);
    group.userData.handleType = type;
    group.renderOrder = 1100;
    group.layers.set(1);

    // use provided corner radius
    const radius = cornerRadius;

    // Fill
    const fillGeom = this.createRoundedRectGeometry(handleSize, radius);
    const fillMat = new THREE.MeshBasicMaterial({
      color: fillColor,
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    });
    const fill = new THREE.Mesh(fillGeom, fillMat);
    fill.userData.handleType = type;
    fill.userData.isFill = true;
    fill.renderOrder = 1101;
    fill.layers.set(1);
    group.add(fill);

    // Border outline (slightly larger)
    const borderMargin = this.getDpr();
    const borderSize = handleSize + 2 * borderMargin;
    const borderRadius = radius + borderMargin;
    const borderGeom = this.createRoundedRectGeometry(borderSize, borderRadius);
    const borderMat = new THREE.MeshBasicMaterial({
      color: borderColor,
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    });
    const border = new THREE.Mesh(borderGeom, borderMat);
    border.userData.handleType = type;
    border.userData.isBorder = true;
    border.renderOrder = 1099;
    border.layers.set(1);
    group.add(border);

    return group;
  }

  /**
   * Create transformation handles (rounded squares with contrast borders) around the selection bounds
   */
  createHandles(bounds: THREE.Box3): THREE.Object3D[] {
    const min = bounds.min;
    const max = bounds.max;
    const z = (min.z + max.z) / 2;
    const midX = (min.x + max.x) / 2;
    const midY = (min.y + max.y) / 2;

    // Fixed rotation handle offset (3x handle size for consistent distance)
    const rotationOffset = this.getHandleSizeWorldPx() * 3;

    const positions: Record<Exclude<TwoDHandle, 'idle' | 'move'>, THREE.Vector3> = {
      'scale-nw': new THREE.Vector3(min.x, max.y, z),
      'scale-n': new THREE.Vector3(midX, max.y, z),
      'scale-ne': new THREE.Vector3(max.x, max.y, z),
      'scale-e': new THREE.Vector3(max.x, midY, z),
      'scale-se': new THREE.Vector3(max.x, min.y, z),
      'scale-s': new THREE.Vector3(midX, min.y, z),
      'scale-sw': new THREE.Vector3(min.x, min.y, z),
      'scale-w': new THREE.Vector3(min.x, midY, z),
      rotate: new THREE.Vector3(midX, max.y + rotationOffset, z),
    };

    const handleSize = this.getHandleSizeWorldPx();

    // calculate clamped corner radius in world pixels
    const cornerRadius = Math.min(
      this.handleCornerRadiusCssPx * this.getDpr(),
      handleSize / 2
    );

    const handles: THREE.Object3D[] = [];
    (
      Object.entries(positions) as Array<[Exclude<TwoDHandle, 'idle' | 'move'>, THREE.Vector3]>
    ).forEach(([type, pos]) => {
      const isRotate = type === 'rotate';
      const group = this.createHandleGroup(
        handleSize,
        isRotate ? this.rotateHandleColor : this.scaleHandleColor,
        isRotate ? this.rotateHandleBorderColor : this.scaleHandleBorderColor,
        type,
        pos,
        cornerRadius
      );
      handles.push(group);
    });

    // Connect rotation handle with a thin line for affordance
    const rotationPos = positions.rotate;
    if (rotationPos) {
      const lineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(midX, max.y, z),
        new THREE.Vector3(rotationPos.x, rotationPos.y, z),
      ]);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xf5b64e, depthTest: false });
      const connector = new THREE.Line(lineGeom, lineMat);
      connector.renderOrder = 1050;
      connector.layers.set(1);
      connector.userData.handleType = 'rotate';
      handles.push(connector);
    }

    return handles;
  }

  /**
   * Update the positions of handles when selection bounds change
   */
  updateHandlePositions(overlay: Selection2DOverlay): void {
    const bounds = overlay.combinedBounds;
    const min = bounds.min;
    const max = bounds.max;
    const z = (min.z + max.z) / 2;
    const midX = (min.x + max.x) / 2;
    const midY = (min.y + max.y) / 2;
    const center = bounds.getCenter(new THREE.Vector3());

    const framePoints = [
      new THREE.Vector3(min.x, min.y, z),
      new THREE.Vector3(max.x, min.y, z),
      new THREE.Vector3(max.x, min.y, z),
      new THREE.Vector3(max.x, max.y, z),
      new THREE.Vector3(max.x, max.y, z),
      new THREE.Vector3(min.x, max.y, z),
      new THREE.Vector3(min.x, max.y, z),
      new THREE.Vector3(min.x, min.y, z),
    ];
    overlay.frame.geometry.setFromPoints(framePoints);

    // Fixed rotation handle offset (3x handle size for consistent distance)
    const rotationOffset = this.getHandleSizeWorldPx() * 3;

    const handlePositions: Record<string, THREE.Vector3> = {
      'scale-nw': new THREE.Vector3(min.x, max.y, z),
      'scale-n': new THREE.Vector3(midX, max.y, z),
      'scale-ne': new THREE.Vector3(max.x, max.y, z),
      'scale-e': new THREE.Vector3(max.x, midY, z),
      'scale-se': new THREE.Vector3(max.x, min.y, z),
      'scale-s': new THREE.Vector3(midX, min.y, z),
      'scale-sw': new THREE.Vector3(min.x, min.y, z),
      'scale-w': new THREE.Vector3(min.x, midY, z),
      rotate: new THREE.Vector3(midX, max.y + rotationOffset, z),
    };

    for (const handle of overlay.handles) {
      const type = handle.userData?.handleType as string | undefined;
      // The rotate connector line geometry is defined in world-space points; don't also translate the Line.
      if (type && handlePositions[type] && !(handle instanceof THREE.Line)) {
        handle.position.copy(handlePositions[type]);
      }
      if (type === 'rotate' && handle instanceof THREE.Line) {
        const lineGeom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(midX, max.y, z),
          handlePositions.rotate,
        ]);
        handle.geometry.dispose();
        handle.geometry = lineGeom;
        handle.position.set(0, 0, 0);
      }
    }

    overlay.centerWorld.copy(center);
  }

  /**
   * Detect which handle is under the cursor at the given screen position.
   * Uses world-space distance check that correctly accounts for zoom-compensated handle sizes.
   */
  getHandleAt(
    screenX: number,
    screenY: number,
    overlay: Selection2DOverlay,
    orthographicCamera: THREE.OrthographicCamera,
    viewportSize: { width: number; height: number }
  ): TwoDHandle {
    const point = this.screenToWorld2D(screenX, screenY, orthographicCamera, viewportSize);
    if (!point) {
      return 'idle';
    }

    // Handle effective half-size in world units, accounting for zoom.
    // Handles are counter-scaled by 1/zoom, so their world extent is handleSize/zoom.
    const zoom = orthographicCamera.zoom || 1;
    const hitHalfSize =
      ((this.handleSizeCssPx + this.handleHitMarginCssPx) * this.getDpr()) / zoom / 2;

    // Test each handle position (prefer specific handles over 'move')
    let bestHandle: TwoDHandle = 'idle';
    let bestDist = Infinity;

    for (const handle of overlay.handles) {
      const type = handle.userData?.handleType as TwoDHandle | undefined;
      if (!type) continue;

      // Skip connector lines — they are affordance only
      if (handle instanceof THREE.Line) continue;

      // Get the handle's world position
      handle.updateWorldMatrix(true, false);
      const handleWorldPos = new THREE.Vector3();
      handle.getWorldPosition(handleWorldPos);

      // Square hit test (axis-aligned in world space)
      const dx = Math.abs(point.x - handleWorldPos.x);
      const dy = Math.abs(point.y - handleWorldPos.y);

      if (dx <= hitHalfSize && dy <= hitHalfSize) {
        const dist = dx + dy; // Manhattan distance for tie-breaking
        if (dist < bestDist) {
          bestDist = dist;
          bestHandle = type as TwoDHandle;
        }
      }
    }

    if (bestHandle !== 'idle') {
      return bestHandle;
    }

    // Fall back to 'move' if pointer is inside the selection bounds
    const bounds = overlay.combinedBounds;
    if (point) {
      const inX = point.x >= bounds.min.x && point.x <= bounds.max.x;
      const inY = point.y >= bounds.min.y && point.y <= bounds.max.y;

      if (inX && inY) {
        return 'move';
      }
    }

    return 'idle';
  }

  /**
   * Begin a 2D transform operation with the given handle
   */
  startTransform(
    screenX: number,
    screenY: number,
    handle: TwoDHandle,
    overlay: Selection2DOverlay,
    sceneGraph: SceneGraph,
    orthographicCamera: THREE.OrthographicCamera,
    viewportSize: { width: number; height: number }
  ): Active2DTransform | null {
    if (!overlay) {
      return null;
    }

    const { nodeIds, combinedBounds, centerWorld } = overlay;
    if (nodeIds.length === 0) return null;

    const pointerWorld = this.screenToWorld2D(screenX, screenY, orthographicCamera, viewportSize);
    if (!pointerWorld) return null;

    const startStates = new Map<string, Transform2DState>();
    for (const nodeId of nodeIds) {
      const node = sceneGraph.nodeMap.get(nodeId);
      if (node && node instanceof Node2D) {
        node.updateWorldMatrix(true, false);
        const worldPosition = node.getWorldPosition(new THREE.Vector3());
        const worldQuat = node.getWorldQuaternion(new THREE.Quaternion());
        const worldEuler = new THREE.Euler().setFromQuaternion(worldQuat, 'XYZ');
        // Some Node2D subclasses (e.g., sprites) may expose width/height; avoid `any` by narrowing
        const dims = node as Node2D & { width?: number; height?: number };
        const width = typeof dims.width === 'number' ? dims.width : undefined;
        const height = typeof dims.height === 'number' ? dims.height : undefined;

        const state: Transform2DState = {
          position: node.position.clone(),
          rotation: node.rotation.z,
          scale: new THREE.Vector2(node.scale.x, node.scale.y),
          width,
          height,
          worldPosition,
          worldRotationZ: worldEuler.z,
        };

        // Capture anchor data for Group2D nodes (for real-time offset updates)
        if (node instanceof Group2D) {
          state.offsetMin = node.offsetMin.clone();
          state.offsetMax = node.offsetMax.clone();
          // Get parent dimensions
          const parentGroup = node.parent instanceof Group2D ? node.parent : null;
          state.parentWidth = parentGroup?.width ?? 0;
          state.parentHeight = parentGroup?.height ?? 0;
        }

        startStates.set(nodeId, state);
      }
    }

    const size = combinedBounds.getSize(new THREE.Vector3());
    const startSize = new THREE.Vector2(size.x, size.y);
    const anchorLocal = this.getAnchorLocal(handle, startSize);
    const anchorWorld = anchorLocal.clone().add(centerWorld);

    return {
      nodeIds,
      handle,
      startPointerWorld: pointerWorld,
      startStates,
      combinedBounds: combinedBounds.clone(),
      startCenterWorld: centerWorld.clone(),
      anchorWorld,
      anchorLocal,
      startSize,
    };
  }

  /**
   * Set the active handle being dragged (for visual feedback).
   * Call at the start of a drag operation.
   */
  setActiveHandle(handle: TwoDHandle, overlay: Selection2DOverlay): void {
    // Clear previous active handle styling
    if (this.activeHandle !== 'idle') {
      this.setHandleActiveState(overlay, this.activeHandle, false);
    }
    this.activeHandle = handle;
    if (handle !== 'idle') {
      this.setHandleActiveState(overlay, handle, true);
    }
  }

  /**
   * Clear the active handle (call at end of drag).
   */
  clearActiveHandle(overlay: Selection2DOverlay | undefined): void {
    if (overlay && this.activeHandle !== 'idle') {
      this.setHandleActiveState(overlay, this.activeHandle, false);
    }
    this.activeHandle = 'idle';
  }

  /**
   * Get the currently active/dragging handle.
   */
  getActiveHandle(): TwoDHandle {
    return this.activeHandle;
  }

  /**
   * Update node transforms during an active 2D transform operation
   */
  updateTransform(
    screenX: number,
    screenY: number,
    transform: Active2DTransform,
    sceneGraph: SceneGraph,
    orthographicCamera: THREE.OrthographicCamera,
    viewportSize: { width: number; height: number }
  ): void {
    const pointerWorld = this.screenToWorld2D(screenX, screenY, orthographicCamera, viewportSize);
    if (!pointerWorld) return;

    const {
      handle,
      startPointerWorld,
      startStates,
      startCenterWorld,
      anchorWorld,
      anchorLocal,
      startSize,
    } = transform;

    if (handle === 'move') {
      const delta = pointerWorld.clone().sub(startPointerWorld);
      for (const [nodeId, startState] of startStates) {
        const node = sceneGraph.nodeMap.get(nodeId);
        if (node && node instanceof Node2D) {
          const startWorld = startState.worldPosition ?? node.getWorldPosition(new THREE.Vector3());
          const newWorld = startWorld.clone().add(delta);
          this.setNodeWorldPosition(node, newWorld);

          // For Group2D, update offsets in real-time during drag
          // This ensures proper anchor-relative positioning
          if (node instanceof Group2D) {
            this.updateGroup2DOffsetsDuringDrag(node, startState, delta);
          }
        }
      }
    } else if (handle === 'rotate') {
      const startAngle = Math.atan2(
        startPointerWorld.y - startCenterWorld.y,
        startPointerWorld.x - startCenterWorld.x
      );
      const currentAngle = Math.atan2(
        pointerWorld.y - startCenterWorld.y,
        pointerWorld.x - startCenterWorld.x
      );
      const deltaAngle = currentAngle - startAngle;

      for (const [nodeId, startState] of startStates) {
        const node = sceneGraph.nodeMap.get(nodeId);
        if (node && node instanceof Node2D) {
          const startWorldRot = startState.worldRotationZ ?? startState.rotation;
          this.setNodeWorldRotationZ(node, startWorldRot + deltaAngle);

          const startWorldPos =
            startState.worldPosition ?? node.getWorldPosition(new THREE.Vector3());
          const offsetFromCenter = startWorldPos.clone().sub(startCenterWorld);
          const rotatedOffset = new THREE.Vector3(
            offsetFromCenter.x * Math.cos(deltaAngle) - offsetFromCenter.y * Math.sin(deltaAngle),
            offsetFromCenter.x * Math.sin(deltaAngle) + offsetFromCenter.y * Math.cos(deltaAngle),
            0
          );
          const newPosition = startCenterWorld.clone().add(rotatedOffset);
          this.setNodeWorldPosition(node, newPosition);
        }
      }
    } else {
      const localPoint = pointerWorld.clone().sub(startCenterWorld);
      let width = startSize.x;
      let height = startSize.y;

      const minSize = this.getMin2DSizeWorldPx();

      const affectsX =
        handle === 'scale-e' ||
        handle === 'scale-w' ||
        handle === 'scale-ne' ||
        handle === 'scale-se' ||
        handle === 'scale-nw' ||
        handle === 'scale-sw';
      const affectsY =
        handle === 'scale-n' ||
        handle === 'scale-s' ||
        handle === 'scale-ne' ||
        handle === 'scale-se' ||
        handle === 'scale-nw' ||
        handle === 'scale-sw';

      if (affectsX) {
        width = Math.max(minSize, Math.abs(localPoint.x - anchorLocal.x));
      }
      if (affectsY) {
        height = Math.max(minSize, Math.abs(localPoint.y - anchorLocal.y));
      }

      const scaleFactorX = width / startSize.x;
      const scaleFactorY = height / startSize.y;

      const anchorLocalNew = this.getAnchorLocal(handle, new THREE.Vector2(width, height));
      const newCenterWorld = anchorWorld.clone().sub(anchorLocalNew);

      for (const [nodeId, startState] of startStates) {
        const node = sceneGraph.nodeMap.get(nodeId);
        if (node && node instanceof Node2D) {
          const startWorldPos =
            startState.worldPosition ?? node.getWorldPosition(new THREE.Vector3());
          const offsetFromCenter = startWorldPos.clone().sub(startCenterWorld);
          const scaledOffset = new THREE.Vector3(
            offsetFromCenter.x * scaleFactorX,
            offsetFromCenter.y * scaleFactorY,
            0
          );
          const newPos = newCenterWorld.clone().add(scaledOffset);
          this.setNodeWorldPosition(node, newPos);

          const startWidth = typeof startState.width === 'number' ? startState.width : undefined;
          const startHeight = typeof startState.height === 'number' ? startState.height : undefined;
          const dimsNode = node as Node2D & { width?: number; height?: number };
          const hasSize =
            typeof dimsNode.width === 'number' &&
            typeof dimsNode.height === 'number' &&
            typeof startWidth === 'number' &&
            typeof startHeight === 'number';

          if (hasSize) {
            dimsNode.width = Math.max(minSize, startWidth * scaleFactorX);
            dimsNode.height = Math.max(minSize, startHeight * scaleFactorY);
            // Keep node.scale stable; size changes should primarily use width/height.
            node.scale.set(startState.scale.x, startState.scale.y, 1);
          } else {
            node.scale.set(startState.scale.x * scaleFactorX, startState.scale.y * scaleFactorY, 1);
          }
        }
      }
    }
  }

  /**
   * Calculate the anchor point (pivot) in local coordinates for a scale handle
   */
  private getAnchorLocal(handle: TwoDHandle, size: THREE.Vector2): THREE.Vector3 {
    const halfW = size.x / 2;
    const halfH = size.y / 2;
    switch (handle) {
      case 'scale-ne':
        return new THREE.Vector3(-halfW, -halfH, 0);
      case 'scale-nw':
        return new THREE.Vector3(halfW, -halfH, 0);
      case 'scale-se':
        return new THREE.Vector3(-halfW, halfH, 0);
      case 'scale-sw':
        return new THREE.Vector3(halfW, halfH, 0);
      case 'scale-n':
        return new THREE.Vector3(0, -halfH, 0);
      case 'scale-s':
        return new THREE.Vector3(0, halfH, 0);
      case 'scale-e':
        return new THREE.Vector3(-halfW, 0, 0);
      case 'scale-w':
        return new THREE.Vector3(halfW, 0, 0);
      default:
        return new THREE.Vector3(-halfW, -halfH, 0);
    }
  }

  /**
   * Convert screen coordinates to NDC (normalized device coordinates)
   */
  private toNdc(
    screenX: number,
    screenY: number,
    viewportSize: { width: number; height: number }
  ): THREE.Vector2 | null {
    const { width, height } = viewportSize;
    if (width <= 0 || height <= 0) return null;
    return new THREE.Vector2((screenX / width) * 2 - 1, -(screenY / height) * 2 + 1);
  }

  /**
   * Convert screen coordinates to world coordinates in the 2D layer
   */
  private screenToWorld2D(
    screenX: number,
    screenY: number,
    orthographicCamera: THREE.OrthographicCamera,
    viewportSize: { width: number; height: number }
  ): THREE.Vector3 | null {
    const ndc = this.toNdc(screenX, screenY, viewportSize);
    if (!ndc) return null;
    const point = new THREE.Vector3(ndc.x, ndc.y, 0);
    point.unproject(orthographicCamera);
    return point;
  }

  /**
   * Update hover state for handles based on cursor position.
   * Returns true if hover state changed (requires re-render).
   */
  updateHover(
    screenX: number,
    screenY: number,
    overlay: Selection2DOverlay | undefined,
    orthographicCamera: THREE.OrthographicCamera | undefined,
    viewportSize: { width: number; height: number }
  ): boolean {
    if (!overlay || !orthographicCamera) {
      if (this.hoveredHandle !== 'idle') {
        this.hoveredHandle = 'idle';
        return true;
      }
      return false;
    }

    const handle = this.getHandleAt(screenX, screenY, overlay, orthographicCamera, viewportSize);
    if (handle === this.hoveredHandle) {
      return false;
    }

    // Reset previous hovered handle color
    this.setHandleHoverState(overlay, this.hoveredHandle, false);

    // Set new hovered handle color
    this.hoveredHandle = handle;
    this.setHandleHoverState(overlay, handle, true);

    return true;
  }

  /**
   * Clear hover state (e.g., when cursor leaves viewport)
   */
  clearHover(overlay: Selection2DOverlay | undefined): boolean {
    if (this.hoveredHandle === 'idle') {
      return false;
    }
    if (overlay) {
      this.setHandleHoverState(overlay, this.hoveredHandle, false);
    }
    this.hoveredHandle = 'idle';
    return true;
  }

  /**
   * Get the currently hovered handle
   */
  getHoveredHandle(): TwoDHandle {
    return this.hoveredHandle;
  }

  /**
   * Apply a color to all fill meshes inside a handle (Group or direct Mesh).
   */
  private setHandleFillColor(handle: THREE.Object3D, color: number): void {
    if (handle instanceof THREE.Group) {
      for (const child of handle.children) {
        if (child instanceof THREE.Mesh && child.userData.isFill) {
          (child.material as THREE.MeshBasicMaterial).color.setHex(color);
          (child.material as THREE.MeshBasicMaterial).needsUpdate = true;
        }
      }
    } else if (handle instanceof THREE.Mesh) {
      (handle.material as THREE.MeshBasicMaterial).color.setHex(color);
      (handle.material as THREE.MeshBasicMaterial).needsUpdate = true;
    } else if (handle instanceof THREE.Line) {
      (handle.material as THREE.LineBasicMaterial).color.setHex(color);
      (handle.material as THREE.LineBasicMaterial).needsUpdate = true;
    }
  }

  /**
   * Set hover visual state for a specific handle
   */
  private setHandleHoverState(
    overlay: Selection2DOverlay,
    handle: TwoDHandle,
    isHovered: boolean
  ): void {
    // Don't change color if this handle is actively being dragged
    if (handle === this.activeHandle && this.activeHandle !== 'idle') {
      return;
    }

    if (handle === 'idle' || handle === 'move') {
      return;
    }

    for (const obj of overlay.handles) {
      const handleType = obj.userData?.handleType as TwoDHandle | undefined;
      if (handleType !== handle) {
        continue;
      }

      const isRotate = handleType === 'rotate';
      const defaultColor = isRotate ? this.rotateHandleColor : this.scaleHandleColor;
      const hoverColor = isRotate ? this.rotateHandleHoverColor : this.scaleHandleHoverColor;
      this.setHandleFillColor(obj, isHovered ? hoverColor : defaultColor);
    }
  }

  /**
   * Set active (dragging) visual state for a specific handle.
   * Active handles show in accent color.
   */
  private setHandleActiveState(
    overlay: Selection2DOverlay,
    handle: TwoDHandle,
    isActive: boolean
  ): void {
    if (handle === 'idle' || handle === 'move') {
      return;
    }

    for (const obj of overlay.handles) {
      const handleType = obj.userData?.handleType as TwoDHandle | undefined;
      if (handleType !== handle) {
        continue;
      }

      const isRotate = handleType === 'rotate';
      const defaultColor = isRotate ? this.rotateHandleColor : this.scaleHandleColor;
      const activeColor = isRotate ? this.rotateHandleActiveColor : this.scaleHandleActiveColor;
      this.setHandleFillColor(obj, isActive ? activeColor : defaultColor);
    }
  }
}
