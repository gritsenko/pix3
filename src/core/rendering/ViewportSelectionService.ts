import {
  Raycaster,
  Vector2,
  Object3D,
  Box3,
  Box3Helper,
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  MathUtils,
} from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { subscribe } from 'valtio/vanilla';

import { injectable, ServiceLifetime, inject } from '../../fw/di';
import { appState, getAppStateSnapshot } from '../../state';
import { SelectObjectCommand } from '../commands/SelectObjectCommand';
import { createCommandContext } from '../commands/command';
import { SceneManager } from '../scene/SceneManager';
import { Node3D } from '../scene/nodes/3D/Node3D';
import { Sprite2D } from '../scene/nodes/2D/Sprite2D';
import { NodeBase } from '../scene/nodes/NodeBase';

type UpdateObjectPropertyCommandCtor =
  typeof import('../commands/UpdateObjectPropertyCommand').UpdateObjectPropertyCommand;

export type TransformMode = 'translate' | 'rotate' | 'scale';

/**
 * Service for handling viewport selection and transform gizmos.
 * Integrates with the app's command system and state management.
 */
@injectable(ServiceLifetime.Transient)
export class ViewportSelectionService {
  private raycaster = new Raycaster();
  private pointer = new Vector2();
  private transformControls: TransformControls | null = null;
  private gizmoHelper: Object3D | null = null;
  private selectionBoxes = new Map<string, Box3Helper>();
  private canvas: HTMLCanvasElement | null = null;
  private camera: PerspectiveCamera | null = null;
  private renderer: WebGLRenderer | null = null;
  private scene: Scene | null = null;
  private sceneContentRoot: Object3D | null = null;
  private transformMode: TransformMode = 'translate';
  private isDisposed = false;
  private disposeSelectionSubscription?: () => void;
  private isApplyingViewportTransform = false;
  private suppressClickUntil = 0;
  private updateCommandCtor?: UpdateObjectPropertyCommandCtor;

  @inject(SceneManager)
  private readonly sceneManager!: SceneManager;

  initialize(
    canvas: HTMLCanvasElement,
    camera: PerspectiveCamera,
    renderer: WebGLRenderer,
    scene: Scene,
    sceneContentRoot: Object3D
  ): void {
    if (this.isDisposed) {
      console.warn('[ViewportSelectionService] Cannot initialize disposed service');
      return;
    }

    this.canvas = canvas;
    this.camera = camera;
    this.renderer = renderer;
    this.scene = scene;
    this.sceneContentRoot = sceneContentRoot;

    this.setupTransformControls();
    this.setupEventListeners();

    this.disposeSelectionSubscription?.();
    this.disposeSelectionSubscription = subscribe(appState.selection, () => {
      this.updateSelection();
    });

    this.updateSelection();
  }

  setTransformMode(mode: TransformMode): void {
    this.transformMode = mode;
    if (this.transformControls) {
      this.transformControls.setMode(mode);
    }
  }

  getTransformMode(): TransformMode {
    return this.transformMode;
  }

  updateSelection(): void {
    if (!this.scene || !this.sceneContentRoot) {
      return;
    }

    this.clearSelectionBoxes();
    const selectedNodeIds = appState.selection.nodeIds;

    for (const nodeId of selectedNodeIds) {
      const object = this.findObjectByNodeId(nodeId, this.sceneContentRoot);
      if (object) {
        this.addSelectionBox(nodeId, object);
      }
    }

    // Attach transform controls to primary selection
    const primaryNodeId = appState.selection.primaryNodeId;
    if (primaryNodeId && this.transformControls) {
      const primaryObject = this.findObjectByNodeId(primaryNodeId, this.sceneContentRoot);
      if (primaryObject) {
        this.transformControls.attach(primaryObject);
      } else {
        this.transformControls.detach();
      }
    } else if (this.transformControls) {
      this.transformControls.detach();
    }
  }

  private setupTransformControls(): void {
    if (!this.camera || !this.renderer || !this.scene) {
      return;
    }

    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setMode(this.transformMode);

    // Tag transform controls to avoid selection
    this.gizmoHelper = this.transformControls.getHelper();
    this.gizmoHelper.traverse((child: Object3D) => {
      child.userData.isGizmo = true;
    });

    this.scene.add(this.gizmoHelper);

    // Handle dragging events
    this.transformControls.addEventListener('dragging-changed', event => {
      // Disable/enable OrbitControls when dragging
      // This will need to be coordinated with ViewportRendererService
      if (event.value) {
        this.canvas?.dispatchEvent(new CustomEvent('viewport:gizmo-drag-start'));
      } else {
        this.canvas?.dispatchEvent(new CustomEvent('viewport:gizmo-drag-end'));
        this.updateSelectionBoxes();
        this.suppressClickUntil = Date.now() + 250;
        void this.commitViewportTransform();
      }
    });

    this.transformControls.addEventListener('objectChange', () => {
      this.updateSelectionBoxes();
    });
  }

  private setupEventListeners(): void {
    if (!this.canvas) {
      return;
    }

    this.canvas.addEventListener('click', this.handleClick, false);
  }

  private handleClick = async (event: MouseEvent): Promise<void> => {
    if (!this.canvas || !this.camera || !this.sceneContentRoot) {
      return;
    }

    if (this.suppressClickUntil !== 0) {
      if (Date.now() < this.suppressClickUntil) {
        this.suppressClickUntil = 0;
        return;
      }

      this.suppressClickUntil = 0;
    }

    // Ignore clicks during transform gizmo dragging
    if (this.transformControls?.dragging) {
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.sceneContentRoot.children, true);

    let selectedNodeId: string | null = null;

    for (const intersect of intersects) {
      const rootObject = this.findRootObject(intersect.object);

      // Skip gizmo objects
      if (rootObject.userData.isGizmo) {
        continue;
      }

      // Skip root scene nodes (direct children of sceneContentRoot that are containers)
      // Instead, try to find a more specific child object
      const selectableObject = this.findSelectableObject(intersect.object);
      if (!selectableObject) {
        continue;
      }

      // Get node ID from the selectable object
      selectedNodeId = selectableObject.userData.nodeId || null;

      if (process.env.NODE_ENV === 'development') {
        console.debug('[ViewportSelection] Selected object:', {
          objectName: selectableObject.name,
          nodeId: selectedNodeId,
          isRootChild: selectableObject.parent === this.sceneContentRoot,
        });
      }
      break;
    }

    // Determine selection behavior based on modifier keys
    const isAdditive = event.ctrlKey || event.metaKey;
    const isRange = event.shiftKey;

    // Execute selection command
    const command = new SelectObjectCommand({
      nodeId: selectedNodeId,
      additive: isAdditive,
      range: isRange,
    });

    try {
      const context = createCommandContext(appState, getAppStateSnapshot());
      const execution = await Promise.resolve(command.execute(context));
      if (execution.didMutate) {
        await command.postCommit?.(context, execution.payload);
        this.updateSelection();
      }
    } catch (error) {
      console.error('[ViewportSelectionService] Failed to execute selection command', error);
    }
  };

  private findRootObject(object: Object3D): Object3D {
    let current = object;
    while (current.parent && current.parent !== this.sceneContentRoot) {
      current = current.parent;
    }
    return current;
  }

  private findSelectableObject(object: Object3D): Object3D | null {
    let current = object;

    // Traverse up to find a selectable object
    while (current && current !== this.sceneContentRoot) {
      // Skip root scene nodes (direct children of sceneContentRoot that are just containers)
      const isRootSceneNode =
        current.parent === this.sceneContentRoot &&
        current.children.length > 0 &&
        !this.hasVisualContent(current);

      if (!isRootSceneNode && current.userData.nodeId) {
        return current;
      }

      current = current.parent!;
    }

    return null;
  }

  private hasVisualContent(object: Object3D): boolean {
    // Check if this object or its immediate children have visual content (meshes, lights, etc.)
    for (const child of object.children) {
      const childRecord = child as unknown as Record<string, unknown>;
      if (
        (childRecord.isMesh as unknown as boolean) ||
        (childRecord.isLight as unknown as boolean) ||
        (childRecord.isSprite as unknown as boolean)
      ) {
        return true;
      }
    }
    return false;
  }

  private findObjectByNodeId(nodeId: string, root: Object3D): Object3D | null {
    if (root.userData.nodeId === nodeId) {
      return root;
    }

    for (const child of root.children) {
      const found = this.findObjectByNodeId(nodeId, child);
      if (found) {
        return found;
      }
    }

    return null;
  }

  private addSelectionBox(nodeId: string, object: Object3D): void {
    if (!this.scene) {
      return;
    }

    const box = new Box3().setFromObject(object);
    const selectionBox = new Box3Helper(box, 0x00ff00);
    selectionBox.userData.isGizmo = true;
    selectionBox.userData.nodeId = nodeId;

    this.scene.add(selectionBox);
    this.selectionBoxes.set(nodeId, selectionBox);
  }

  private clearSelectionBoxes(): void {
    if (!this.scene) {
      return;
    }

    for (const selectionBox of this.selectionBoxes.values()) {
      this.scene.remove(selectionBox);
      selectionBox.dispose();
    }
    this.selectionBoxes.clear();
  }

  private updateSelectionBoxes(): void {
    if (!this.sceneContentRoot) {
      return;
    }

    for (const [nodeId, selectionBox] of this.selectionBoxes) {
      const object = this.findObjectByNodeId(nodeId, this.sceneContentRoot);
      if (object) {
        selectionBox.box.setFromObject(object);
      }
    }
  }

  private async commitViewportTransform(): Promise<void> {
    if (!this.transformControls || !this.transformControls.object) {
      return;
    }

    if (this.isApplyingViewportTransform) {
      return;
    }

    this.isApplyingViewportTransform = true;
    try {
      await this.syncObjectTransformToSceneGraph(this.transformControls.object);
    } finally {
      this.isApplyingViewportTransform = false;
    }
  }

  private async syncObjectTransformToSceneGraph(object: Object3D): Promise<void> {
    const nodeId = object.userData?.nodeId as string | undefined;
    if (!nodeId) {
      return;
    }

    const sceneGraph = this.sceneManager.getActiveSceneGraph();
    if (!sceneGraph) {
      return;
    }

    const node = sceneGraph.nodeMap.get(nodeId);
    if (!node) {
      return;
    }

    const updates = this.collectTransformUpdates(node, object);
    if (updates.length === 0) {
      return;
    }

    const context = createCommandContext(appState, getAppStateSnapshot());

    if (!this.updateCommandCtor) {
      const module = await import('../commands/UpdateObjectPropertyCommand');
      this.updateCommandCtor = module.UpdateObjectPropertyCommand;
    }
    const UpdateObjectPropertyCommand = this.updateCommandCtor;

    for (const update of updates) {
      const command = new UpdateObjectPropertyCommand({
        nodeId,
        propertyPath: update.propertyPath,
        value: update.value,
      });

      try {
        const execution = await Promise.resolve(command.execute(context));
        if (execution.didMutate) {
          await command.postCommit?.(context, execution.payload);
        }
      } catch (error) {
        console.error('[ViewportSelectionService] Failed to sync viewport transform', error);
        break;
      }
    }
  }

  private collectTransformUpdates(
    node: NodeBase,
    object: Object3D
  ): Array<{ propertyPath: string; value: number }> {
    const epsilon = 1e-4;
    const updates: Array<{ propertyPath: string; value: number }> = [];

    if (node instanceof Node3D) {
      const position = object.position;
      if (Math.abs(position.x - node.position.x) > epsilon) {
        updates.push({ propertyPath: 'position.x', value: this.roundTransformValue(position.x) });
      }
      if (Math.abs(position.y - node.position.y) > epsilon) {
        updates.push({ propertyPath: 'position.y', value: this.roundTransformValue(position.y) });
      }
      if (Math.abs(position.z - node.position.z) > epsilon) {
        updates.push({ propertyPath: 'position.z', value: this.roundTransformValue(position.z) });
      }

      const rotation = object.rotation;
      const rotX = MathUtils.radToDeg(rotation.x);
      const rotY = MathUtils.radToDeg(rotation.y);
      const rotZ = MathUtils.radToDeg(rotation.z);

      if (Math.abs(rotX - node.rotation.x) > epsilon) {
        updates.push({ propertyPath: 'rotation.x', value: this.roundTransformValue(rotX) });
      }
      if (Math.abs(rotY - node.rotation.y) > epsilon) {
        updates.push({ propertyPath: 'rotation.y', value: this.roundTransformValue(rotY) });
      }
      if (Math.abs(rotZ - node.rotation.z) > epsilon) {
        updates.push({ propertyPath: 'rotation.z', value: this.roundTransformValue(rotZ) });
      }

      const scale = object.scale;
      if (Math.abs(scale.x - node.scale.x) > epsilon) {
        updates.push({ propertyPath: 'scale.x', value: this.roundTransformValue(scale.x) });
      }
      if (Math.abs(scale.y - node.scale.y) > epsilon) {
        updates.push({ propertyPath: 'scale.y', value: this.roundTransformValue(scale.y) });
      }
      if (Math.abs(scale.z - node.scale.z) > epsilon) {
        updates.push({ propertyPath: 'scale.z', value: this.roundTransformValue(scale.z) });
      }
    } else if (node instanceof Sprite2D) {
      const position = object.position;
      if (Math.abs(position.x - node.position.x) > epsilon) {
        updates.push({ propertyPath: 'position.x', value: this.roundTransformValue(position.x) });
      }
      if (Math.abs(position.y - node.position.y) > epsilon) {
        updates.push({ propertyPath: 'position.y', value: this.roundTransformValue(position.y) });
      }

      const rotationZ = MathUtils.radToDeg(object.rotation.z);
      if (Math.abs(rotationZ - node.rotation) > epsilon) {
        updates.push({ propertyPath: 'rotation.z', value: this.roundTransformValue(rotationZ) });
      }

      const scale = object.scale;
      if (Math.abs(scale.x - node.scale.x) > epsilon) {
        updates.push({ propertyPath: 'scale.x', value: this.roundTransformValue(scale.x) });
      }
      if (Math.abs(scale.y - node.scale.y) > epsilon) {
        updates.push({ propertyPath: 'scale.y', value: this.roundTransformValue(scale.y) });
      }
    }

    return updates;
  }

  private roundTransformValue(value: number): number {
    const rounded = Number(value.toFixed(4));
    return Math.abs(rounded) < 1e-6 ? 0 : rounded;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    this.disposeSelectionSubscription?.();
    this.disposeSelectionSubscription = undefined;

    // Remove event listeners
    if (this.canvas) {
      this.canvas.removeEventListener('click', this.handleClick, false);
    }

    // Clean up transform controls
    if (this.transformControls) {
      this.transformControls.dispose();
      if (this.scene && this.gizmoHelper) {
        this.scene.remove(this.gizmoHelper);
      }
    }

    // Clean up selection boxes
    this.clearSelectionBoxes();

    // Clear references
  this.suppressClickUntil = 0;
    this.canvas = null;
    this.camera = null;
    this.renderer = null;
    this.scene = null;
    this.sceneContentRoot = null;
    this.transformControls = null;
  }
}
