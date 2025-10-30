/**
 * ViewportRendererService - Renders the Three.js 3D scene viewport
 *
 * IMPORTANT: This service is READ-ONLY for state. It visualizes the current scene structure
 * but never modifies appState. All mutations must go through Operations and OperationService.
 * This separation ensures clean UI state management and proper undo/redo support.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { NodeBase } from '@/nodes/NodeBase';
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
  private orbitControls?: OrbitControls;
  private transformControls?: TransformControls;
  private transformGizmo?: THREE.Object3D;
  private selectedObjects = new Set<THREE.Object3D>();
  private selectionBoxes = new Map<string, THREE.Box3Helper>();
  private animationId?: number;
  private disposers: Array<() => void> = [];
  private lastActiveSceneId: string | null = null;

  constructor() {}

  initialize(canvas: HTMLCanvasElement): void {
    // Create Three.js renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });

    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x13161b, 1);

    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x13161b);

    // Create camera
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 10000);
    this.camera.position.set(5, 5, 5);
    this.camera.lookAt(0, 0, 0);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    this.scene.add(directionalLight);

    // Add grid helper for reference
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    this.scene.add(gridHelper);

    // Initialize OrbitControls
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitControls.autoRotate = false;
    this.orbitControls.enableZoom = true;
    this.orbitControls.enablePan = true;

    // Initialize TransformControls for object manipulation
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setMode('translate'); // Default to translate mode

    // When dragging with transform controls, disable orbit controls
    this.transformControls.addEventListener('dragging-changed', (event: any) => {
      if (this.orbitControls) {
        this.orbitControls.enabled = !event.value;
      }
    });

    // Update selection box when transform control object changes
    this.transformControls.addEventListener('objectChange', () => {
      this.updateSelectionBoxes();
    });

    // Start render loop
    this.startRenderLoop();

    // Poll active scene ID for changes (avoid subscribing to entire scenes object to prevent feedback loops)
    const checkSceneChanges = () => {
      const currentSceneId = appState.scenes.activeSceneId;
      if (currentSceneId !== this.lastActiveSceneId) {
        this.lastActiveSceneId = currentSceneId;
        this.syncSceneContent();
      }
    };

    // Check scene changes every frame
    const pollInterval = setInterval(checkSceneChanges, 100);
    this.disposers.push(() => clearInterval(pollInterval));

    // Subscribe to selection changes
    const unsubscribeSelection = subscribe(appState.selection, () => {
      this.updateSelection();
    });
    this.disposers.push(unsubscribeSelection);

    // Subscribe to hierarchy changes to detect node structure mutations
    // This handles cases where operations affect node structure (e.g., adding/removing nodes)
    const unsubscribeHierarchies = subscribe(appState.scenes.hierarchies, () => {
      this.syncSceneContent();
    });
    this.disposers.push(unsubscribeHierarchies);

    // Initial sync
    checkSceneChanges();
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
    // Set the transform mode for the gizmo
    if (this.transformControls) {
      this.transformControls.setMode(mode);
    }
  }

  /**
   * Raycast from camera through screen position and find the deepest NodeBase object.
   * @param screenX Normalized screen X coordinate (0 to 1)
   * @param screenY Normalized screen Y coordinate (0 to 1)
   * @returns The deepest NodeBase object under the pointer, or null if none found
   */
  raycastObject(screenX: number, screenY: number): NodeBase | null {
    if (!this.scene || !this.camera || !this.renderer) {
      return null;
    }

    // Create raycaster and convert screen coordinates to normalized device coordinates
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Convert from screen coordinates (0-1) to NDC (-1 to 1)
    mouse.x = screenX * 2 - 1;
    mouse.y = -(screenY * 2 - 1);

    // Cast ray from camera through mouse position
    raycaster.setFromCamera(mouse, this.camera);

    // Get all objects in the scene
    const sceneObjects: THREE.Object3D[] = [];
    this.scene.traverse(obj => {
      if (obj instanceof NodeBase) {
        sceneObjects.push(obj);
      }
    });

    // Raycast against all objects
    const intersects = raycaster.intersectObjects(sceneObjects, true);

    if (intersects.length === 0) {
      return null;
    }

    // Find the deepest NodeBase in the hierarchy
    // Start from the closest intersection and traverse up to find the deepest NodeBase ancestor
    for (const intersection of intersects) {
      let current: THREE.Object3D | null = intersection.object;

      // Traverse up the hierarchy to find the deepest NodeBase
      while (current) {
        if (current instanceof NodeBase) {
          return current;
        }
        current = current.parent;
      }
    }

    return null;
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
    // Detach transform controls from previous object
    if (this.transformControls) {
      this.transformControls.detach();
    }

    // Remove previous transform gizmo from scene
    if (this.transformGizmo && this.scene) {
      this.scene.remove(this.transformGizmo);
      this.transformGizmo = undefined;
    }

    // Clear previous selection boxes and dispose their Three.js resources
    for (const box of this.selectionBoxes.values()) {
      if (this.scene) {
        this.scene.remove(box);
      }
      // Dispose Three.js resources to prevent memory leaks
      box.geometry.dispose();
      if (box.material instanceof THREE.Material) {
        box.material.dispose();
      }
    }
    this.selectionBoxes.clear();

    // Extra safety: remove any lingering selection boxes from the scene
    // (in case of reference mismatches)
    if (this.scene) {
      const toRemove: THREE.Object3D[] = [];
      this.scene.children.forEach(child => {
        if ((child as any).userData?.isSelectionBox || (child as any).userData?.isTransformGizmo) {
          toRemove.push(child);
        }
      });
      toRemove.forEach(child => {
        this.scene?.remove(child);
      });
    }

    // Get selected node IDs from app state
    const { nodeIds } = appState.selection;
    const activeSceneId = appState.scenes.activeSceneId;

    if (!activeSceneId) {
      return;
    }

    const sceneGraph = this.sceneManager.getSceneGraph(activeSceneId);
    if (!sceneGraph) {
      return;
    }

    // Clear previous selection object tracking
    this.selectedObjects.clear();

    // Add selection boxes for selected nodes and attach transform controls to the first one
    let firstSelectedNode: Node3D | null = null;
    for (const nodeId of nodeIds) {
      const node = this.findNodeById(nodeId, sceneGraph.rootNodes);
      if (node && node instanceof Node3D) {
        this.selectedObjects.add(node);

        // Track the first selected node for transform controls
        if (!firstSelectedNode) {
          firstSelectedNode = node;
        }

        // Create bounding box visualization
        const box = new THREE.Box3().setFromObject(node);
        const helper = new THREE.Box3Helper(box, new THREE.Color(0x00ff00));
        
        // Mark as selection box for cleanup
        helper.userData.selectionBoxId = nodeId;
        helper.userData.isSelectionBox = true;
        
        this.selectionBoxes.set(nodeId, helper);
        this.scene?.add(helper);
      }
    }

    // Attach transform controls to the first selected node if any
    if (firstSelectedNode && this.transformControls && this.scene) {
      this.transformControls.attach(firstSelectedNode);

      // Get and add the transform gizmo to the scene
      this.transformGizmo = this.transformControls.getHelper();
      this.transformGizmo.userData.isTransformGizmo = true;
      this.transformGizmo.traverse(child => {
        child.userData.isTransformGizmo = true;
      });
      this.scene.add(this.transformGizmo);
    }
  }

  private syncSceneContent(): void {
    try {
      const activeSceneId = appState.scenes.activeSceneId;

      if (!this.scene || !activeSceneId) {
        return;
      }

      const sceneGraph = this.sceneManager.getSceneGraph(activeSceneId);
      if (!sceneGraph) {
        return;
      }

      // Remove all root nodes from scene (except lights and helpers)
      const objectsToRemove: THREE.Object3D[] = [];
      this.scene.children.forEach(child => {
        // Keep lights and grid
        if (!(child instanceof THREE.Light) && !(child instanceof THREE.GridHelper)) {
          objectsToRemove.push(child);
        }
      });

      objectsToRemove.forEach(obj => this.scene!.remove(obj));

      // Add scene graph root nodes
      sceneGraph.rootNodes.forEach(node => {
        if (node instanceof Node3D && !node.parent) {
          this.scene!.add(node);
        }
      });
    } catch (err) {
      console.error('[ViewportRenderer] Error syncing scene content:', err);
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

  private updateSelectionBoxes(): void {
    // Update all selection boxes to follow their objects during transform
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
  }

  private startRenderLoop(): void {
    const render = () => {
      this.animationId = requestAnimationFrame(render);

      if (this.renderer && this.scene && this.camera) {
        // Update orbit controls
        this.orbitControls?.update();

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

    // Dispose orbit controls
    this.orbitControls?.dispose();

    // Dispose transform controls
    this.transformControls?.dispose();

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
    this.orbitControls = undefined;
    this.transformControls = undefined;
    this.transformGizmo = undefined;
  }
}
