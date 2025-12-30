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
import { Node2D } from '@/nodes/Node2D';

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
   * Create transformation handles (squares) around the selection bounds
   */
  createHandles(bounds: THREE.Box3): THREE.Object3D[] {
    const min = bounds.min;
    const max = bounds.max;
    const z = (min.z + max.z) / 2;
    const midX = (min.x + max.x) / 2;
    const midY = (min.y + max.y) / 2;

    const positions: Record<Exclude<TwoDHandle, 'idle' | 'move'>, THREE.Vector3> = {
      'scale-nw': new THREE.Vector3(min.x, max.y, z),
      'scale-n': new THREE.Vector3(midX, max.y, z),
      'scale-ne': new THREE.Vector3(max.x, max.y, z),
      'scale-e': new THREE.Vector3(max.x, midY, z),
      'scale-se': new THREE.Vector3(max.x, min.y, z),
      'scale-s': new THREE.Vector3(midX, min.y, z),
      'scale-sw': new THREE.Vector3(min.x, min.y, z),
      'scale-w': new THREE.Vector3(min.x, midY, z),
      rotate: new THREE.Vector3(midX, max.y + Math.max(max.y - min.y, max.x - min.x) * 0.12, z),
    };

    // Ortho camera uses physical pixels as world units (see ViewportRendererService.resize).
    // Keep handles a stable size in CSS pixels by multiplying by DPR.
    const handleSize = this.getHandleSizeWorldPx();
    const handleColor = 0x4e8df5;
    const handleGeometry = new THREE.PlaneGeometry(handleSize, handleSize);
    const handleMaterial = new THREE.MeshBasicMaterial({
      color: handleColor,
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    });

    const rotationMaterial = new THREE.MeshBasicMaterial({
      color: 0xf5b64e,
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: 0.9,
    });

    const handles: THREE.Object3D[] = [];
    (
      Object.entries(positions) as Array<[Exclude<TwoDHandle, 'idle' | 'move'>, THREE.Vector3]>
    ).forEach(([type, pos]) => {
      const mesh = new THREE.Mesh(
        handleGeometry.clone(),
        type === 'rotate' ? rotationMaterial.clone() : handleMaterial.clone()
      );
      mesh.position.copy(pos);
      mesh.userData.handleType = type;
      mesh.renderOrder = 1100;
      mesh.layers.set(1);
      handles.push(mesh);
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

    const handlePositions: Record<string, THREE.Vector3> = {
      'scale-nw': new THREE.Vector3(min.x, max.y, z),
      'scale-n': new THREE.Vector3(midX, max.y, z),
      'scale-ne': new THREE.Vector3(max.x, max.y, z),
      'scale-e': new THREE.Vector3(max.x, midY, z),
      'scale-se': new THREE.Vector3(max.x, min.y, z),
      'scale-s': new THREE.Vector3(midX, min.y, z),
      'scale-sw': new THREE.Vector3(min.x, min.y, z),
      'scale-w': new THREE.Vector3(min.x, midY, z),
      rotate: new THREE.Vector3(midX, max.y + Math.max(max.y - min.y, max.x - min.x) * 0.12, z),
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
   * Detect which handle is under the cursor at the given screen position
   */
  getHandleAt(
    screenX: number,
    screenY: number,
    overlay: Selection2DOverlay,
    orthographicCamera: THREE.OrthographicCamera,
    viewportSize: { width: number; height: number }
  ): TwoDHandle {
    const mouse = this.toNdc(screenX, screenY, viewportSize);
    if (!mouse) {
      return 'idle';
    }

    // Ensure matrices are current before raycasting.
    // Raycaster does not guarantee fresh matrixWorld after we mutate handle positions.
    overlay.group.updateMatrixWorld(true);

    const raycaster = new THREE.Raycaster();
    // Handles live on layer 1; Raycaster defaults to layer 0.
    raycaster.layers.set(1);
    // Make thin connector line easier to hit.
    raycaster.params.Line.threshold = 6 * this.getDpr();
    raycaster.setFromCamera(mouse, orthographicCamera);

    // DEBUG: log pointer vs all handle positions (in world space)
    const pointerWorld = this.screenToWorld2D(screenX, screenY, orthographicCamera, viewportSize);
    console.debug('[TransformTool2d] pointer vs handles:');
    console.debug(
      '  pointer:',
      pointerWorld ? `(${pointerWorld.x.toFixed(0)}, ${pointerWorld.y.toFixed(0)})` : 'null'
    );
    console.debug(
      '  bounds:',
      `min(${overlay.combinedBounds.min.x.toFixed(0)}, ${overlay.combinedBounds.min.y.toFixed(0)}) max(${overlay.combinedBounds.max.x.toFixed(0)}, ${overlay.combinedBounds.max.y.toFixed(0)})`
    );
    for (const h of overlay.handles) {
      const wp = h.getWorldPosition(new THREE.Vector3());
      console.debug(`  ${h.userData?.handleType}: (${wp.x.toFixed(0)}, ${wp.y.toFixed(0)})`);
    }

    const hits = raycaster.intersectObjects(overlay.handles, true);
    console.debug(
      '[TransformTool2d] raycast hits',
      hits.length,
      hits.map(h => h.object.userData?.handleType)
    );
    if (hits.length) {
      // Prefer actual handle meshes over the rotation connector line.
      const meshHit = hits.find(h => h.object instanceof THREE.Mesh);
      const bestHit = meshHit ?? hits[0];
      const handleType = bestHit.object.userData?.handleType as TwoDHandle | undefined;
      return handleType ?? 'idle';
    }

    const point = this.screenToWorld2D(screenX, screenY, orthographicCamera, viewportSize);
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
    sceneGraph: any,
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
        const width = typeof (node as any).width === 'number' ? (node as any).width : undefined;
        const height = typeof (node as any).height === 'number' ? (node as any).height : undefined;
        startStates.set(nodeId, {
          position: node.position.clone(),
          rotation: node.rotation.z,
          scale: new THREE.Vector2(node.scale.x, node.scale.y),
          width,
          height,
          worldPosition,
          worldRotationZ: worldEuler.z,
        });
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
   * Update node transforms during an active 2D transform operation
   */
  updateTransform(
    screenX: number,
    screenY: number,
    transform: Active2DTransform,
    sceneGraph: any,
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
          const hasSize =
            typeof (node as any).width === 'number' &&
            typeof (node as any).height === 'number' &&
            typeof startWidth === 'number' &&
            typeof startHeight === 'number';

          if (hasSize) {
            (node as any).width = Math.max(minSize, startWidth * scaleFactorX);
            (node as any).height = Math.max(minSize, startHeight * scaleFactorY);
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
}
