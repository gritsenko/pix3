/**
 * ViewportRendererService - Renders the Three.js 3D scene viewport
 *
 * IMPORTANT: This service is READ-ONLY for state. It visualizes the current scene structure
 * but never modifies appState. All mutations must go through Operations and OperationService.
 * This separation ensures clean UI state management and proper undo/redo support.
 */
import * as THREE from 'three';
import type { NodeBase } from '@/nodes/NodeBase';
import { Node3D } from '@/nodes/Node3D';
import { injectable, inject } from '@/fw/di';
import { SceneManager } from '@/core/SceneManager';
import { appState } from '@/state';
import { subscribe } from 'valtio/vanilla';

export type TransformMode = 'translate' | 'rotate' | 'scale';

@injectable()
export class ViewportRendererService {
  @inject(SceneManager)
  private readonly sceneManager!: SceneManager;

  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private selectedObjects = new Set<THREE.Object3D>();
  private selectionBoxes = new Map<string, THREE.Box3Helper>();
  private animationId?: number;
  private disposers: Array<() => void> = [];
  private lastActiveSceneId: string | null = null;

  constructor() {}

  initialize(canvas: HTMLCanvasElement): void {
    console.log('[VP] initialize start');

    // Create Three.js renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    console.log('[VP] renderer created');

    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x13161b, 1);

    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x13161b);
    console.log('[VP] scene created');

    // Create camera
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 10000);
    this.camera.position.set(5, 5, 5);
    this.camera.lookAt(0, 0, 0);
    console.log('[VP] camera created');

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    this.scene.add(directionalLight);
    console.log('[VP] lights added');

    // Add grid helper for reference
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    this.scene.add(gridHelper);
    console.log('[VP] grid added');

    // Start render loop
    this.startRenderLoop();
    console.log('[VP] render loop started');

    // Poll active scene ID for changes (avoid subscribing to entire scenes object to prevent feedback loops)
    const checkSceneChanges = () => {
      const currentSceneId = appState.scenes.activeSceneId;
      if (currentSceneId !== this.lastActiveSceneId) {
        console.log('[VP] active scene changed from', this.lastActiveSceneId, 'to', currentSceneId);
        this.lastActiveSceneId = currentSceneId;
        this.syncSceneContent();
      }
    };

    // Check scene changes every frame
    const pollInterval = setInterval(checkSceneChanges, 100);
    this.disposers.push(() => clearInterval(pollInterval));
    console.log('[VP] scene poll added');

    // Subscribe to selection changes
    const unsubscribeSelection = subscribe(appState.selection, () => {
      console.log('[VP] selection subscription fired');
      this.updateSelection();
    });
    this.disposers.push(unsubscribeSelection);
    console.log('[VP] selection subscription added');

    // Initial sync
    console.log('[VP] calling initial syncSceneContent');
    checkSceneChanges();
    console.log('[VP] initialize complete');
  }

  resize(width: number, height: number): void {
    if (!this.renderer || !this.camera) return;

    const pixelWidth = Math.ceil(width * window.devicePixelRatio);
    const pixelHeight = Math.ceil(height * window.devicePixelRatio);

    this.renderer.setSize(pixelWidth, pixelHeight, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setTransformMode(mode: TransformMode): void {
    // Store the mode for future use in transform controls
    // This can be used when implementing gizmos for transformations
    if (mode) {
      // Mode stored for future implementation
    }
  }

  updateNodeTransform(node: NodeBase): void {
    // Node is already a Three.js Object3D, so it updates automatically via reactivity
    if (this.scene && node instanceof Node3D) {
      // Ensure the node is in the scene if it's not already
      if (!node.parent) {
        this.scene.add(node);
      }
    }
  }

  updateSelection(): void {
    console.log('[VP] updateSelection START');

    // Clear previous selection visualization
    for (const box of this.selectionBoxes.values()) {
      this.scene?.remove(box);
    }
    this.selectionBoxes.clear();
    console.log('[VP] cleared old boxes');

    // Get selected node IDs from app state
    const { nodeIds } = appState.selection;
    const activeSceneId = appState.scenes.activeSceneId;
    console.log('[VP] selected nodes:', nodeIds.length, 'scene:', activeSceneId);

    if (!activeSceneId) {
      console.log('[VP] no active scene');
      return;
    }

    console.log('[VP] getting scene graph');
    const sceneGraph = this.sceneManager.getSceneGraph(activeSceneId);
    if (!sceneGraph) {
      console.log('[VP] no scene graph');
      return;
    }

    // Clear previous selection
    this.selectedObjects.clear();

    // Add selection boxes for selected nodes
    console.log('[VP] processing', nodeIds.length, 'selected nodes');
    for (const nodeId of nodeIds) {
      console.log('[VP]   finding node', nodeId);
      const node = this.findNodeById(nodeId, sceneGraph.rootNodes);
      if (node && node instanceof Node3D) {
        this.selectedObjects.add(node);

        // Create and add selection box
        const box = new THREE.Box3().setFromObject(node);
        const helper = new THREE.Box3Helper(box, new THREE.Color(0x00ff00));
        this.selectionBoxes.set(nodeId, helper);
        this.scene?.add(helper);
        console.log('[VP]   added box for', nodeId);
      }
    }
    console.log('[VP] updateSelection COMPLETE');
  }

  private syncSceneContent(): void {
    console.log('[VP] syncSceneContent START');

    try {
      console.log('[VP] getting active scene');
      const activeSceneId = appState.scenes.activeSceneId;
      console.log('[VP] active scene id:', activeSceneId);

      if (!this.scene || !activeSceneId) {
        console.log('[VP] no scene or id, returning');
        return;
      }

      console.log('[VP] getting scene graph');
      const sceneGraph = this.sceneManager.getSceneGraph(activeSceneId);
      console.log('[VP] scene graph:', sceneGraph ? 'got it' : 'null');

      if (!sceneGraph) {
        console.log('[VP] no graph, returning');
        return;
      }

      console.log('[VP] finding objects to remove');
      // Remove all root nodes from scene (except lights and helpers)
      const objectsToRemove: THREE.Object3D[] = [];
      this.scene.children.forEach(child => {
        // Keep lights, camera helpers, and grid
        if (!(child instanceof THREE.Light) && !(child instanceof THREE.GridHelper)) {
          objectsToRemove.push(child);
        }
      });

      console.log('[VP] removing', objectsToRemove.length, 'objects');
      objectsToRemove.forEach(obj => this.scene!.remove(obj));

      console.log('[VP] adding', sceneGraph.rootNodes.length, 'root nodes');
      // Add scene graph root nodes
      sceneGraph.rootNodes.forEach((node, idx) => {
        console.log(
          '[VP]   node',
          idx,
          'parent:',
          node.parent ? 'yes' : 'no',
          'type:',
          node instanceof Node3D
        );
        if (node instanceof Node3D && !node.parent) {
          console.log('[VP]   adding node', idx);
          this.scene!.add(node);
        }
      });

      console.log('[VP] syncSceneContent COMPLETE');
    } catch (err) {
      console.error('[VP] error in syncSceneContent:', err);
    }
  }

  private findNodeById(nodeId: string, nodes: NodeBase[]): NodeBase | null {
    for (const node of nodes) {
      if (node.nodeId === nodeId) {
        return node;
      }
      const found = this.findNodeById(nodeId, node.children);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private startRenderLoop(): void {
    const render = () => {
      this.animationId = requestAnimationFrame(render);

      if (this.renderer && this.scene && this.camera) {
        // Only update selection boxes every few frames to avoid performance issues
        if ((this.animationId || 0) % 10 === 0) {
          try {
            // Update selection boxes
            for (const [nodeId, box] of this.selectionBoxes.entries()) {
              const sceneGraph = this.sceneManager.getActiveSceneGraph();
              if (sceneGraph) {
                const node = this.findNodeById(nodeId, sceneGraph.rootNodes);
                if (node && node instanceof Node3D) {
                  const newBox = new THREE.Box3().setFromObject(node);
                  box.box.copy(newBox);
                }
              }
            }
          } catch (error) {
            console.error('[ViewportRenderer] Error updating selection:', error);
          }
        }

        this.renderer.render(this.scene, this.camera);
      }
    };

    render();
  }

  dispose(): void {
    // Cancel animation loop
    if (this.animationId !== undefined) {
      cancelAnimationFrame(this.animationId);
    }

    // Dispose Three.js resources
    this.selectionBoxes.forEach(box => {
      box.geometry.dispose();
      if (box.material instanceof THREE.Material) {
        box.material.dispose();
      }
    });
    this.selectionBoxes.clear();

    if (this.scene) {
      this.scene.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (obj.material instanceof THREE.Material) {
            obj.material.dispose();
          }
        }
      });
    }

    this.renderer?.dispose();

    // Dispose subscriptions
    this.disposers.forEach(dispose => dispose());
    this.disposers = [];

    this.renderer = undefined;
    this.scene = undefined;
    this.camera = undefined;
  }
}
