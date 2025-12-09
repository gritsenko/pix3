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
import { MathUtils } from 'three';
import { NodeBase } from '@/nodes/NodeBase';
import { Node2D } from '@/nodes/Node2D';
import { Node3D } from '@/nodes/Node3D';
import { Group2D } from '@/nodes/2D/Group2D';
import { Sprite2D } from '@/nodes/2D/Sprite2D';
import { injectable, inject } from '@/fw/di';
import { SceneManager } from '@/core/SceneManager';
import { OperationService } from '@/services/OperationService';
import { ResourceManager } from '@/services/ResourceManager';
import { appState } from '@/state';
import { subscribe } from 'valtio/vanilla';
import {
  TransformCompleteOperation,
  type TransformState,
} from '@/features/properties/TransformCompleteOperation';
import {
  Transform2DCompleteOperation,
  type Transform2DState,
} from '@/features/properties/Transform2DCompleteOperation';

export type TransformMode = 'select' | 'translate' | 'rotate' | 'scale';
type TwoDHandle =
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

@injectable()
export class ViewportRendererService {
  @inject(SceneManager)
  private readonly sceneManager!: SceneManager;

  @inject(OperationService)
  private readonly operationService!: OperationService;

  @inject(ResourceManager)
  private readonly resourceManager!: ResourceManager;

  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private orthographicCamera?: THREE.OrthographicCamera;
  private orbitControls?: OrbitControls;
  private transformControls?: TransformControls;
  private transformGizmo?: THREE.Object3D;
  private currentTransformMode: TransformMode = 'select';
  private selectedObjects = new Set<THREE.Object3D>();
  private selectionBoxes = new Map<string, THREE.Box3Helper>();
  private group2DMeshes = new Map<string, THREE.LineSegments>(); // Track Group2D visual representations
  private sprite2DMeshes = new Map<string, THREE.Mesh>(); // Track Sprite2D visual representations
  private selection2DOverlay?: {
    group: THREE.Group;
    handles: THREE.Object3D[];
    frame: THREE.LineSegments;
    nodeId: string;
    anchorWorld: THREE.Vector3;
    anchorLocal: THREE.Vector3;
    baseSize: THREE.Vector2;
    startSize: THREE.Vector2;
    centerWorld: THREE.Vector3;
    rotationHandle?: THREE.Object3D;
    bounds: THREE.Box3;
  };
  private active2DTransform?: {
    nodeId: string;
    handle: TwoDHandle;
    startPointerWorld: THREE.Vector3;
    startPosition: THREE.Vector3;
    startRotation: number;
    startState: Transform2DState;
    baseSize: THREE.Vector2;
    startSize: THREE.Vector2;
    anchorWorld: THREE.Vector3;
    anchorLocal: THREE.Vector3;
    startCenterWorld: THREE.Vector3;
  };
  private animationId?: number;
  private disposers: Array<() => void> = [];
  private transformStartStates = new Map<
    string,
    { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }
  >();
  private lastActiveSceneId: string | null = null;
  private viewportSize = { width: 0, height: 0 };
  private readonly min2DSize = 4;
  private orbitLocked = false;

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

    // Set up camera layers: layer 0 for 3D nodes, layer 1 for 2D nodes
    // Main perspective camera only renders 3D layer
    this.camera.layers.disableAll();
    this.camera.layers.enable(0);

    // Create orthographic camera for 2D layer overlay
    this.orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.orthographicCamera.position.z = 100;
    // Orthographic camera only renders 2D layer
    this.orthographicCamera.layers.disableAll();
    this.orthographicCamera.layers.enable(1);

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
    this.orbitControls.dampingFactor = 0.3;
    this.orbitControls.autoRotate = false;
    this.orbitControls.enableZoom = true;
    this.orbitControls.enablePan = true;

    // Initialize TransformControls for object manipulation
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setMode('translate'); // Default to translate mode
    this.transformControls.size = 0.6; // Make gizmos smaller/thinner (default is 1)

    // When dragging with transform controls, disable orbit controls
    this.transformControls.addEventListener('dragging-changed', (event: any) => {
      this.setOrbitEnabled(!event.value);

      // Track transform start state when dragging begins
      if (event.value && this.transformControls?.object) {
        this.captureTransformStartState(this.transformControls.object);
      }
    });

    // Update selection box when transform control object changes
    this.transformControls.addEventListener('objectChange', () => {
      this.updateSelectionBoxes();
    });

    // Handle transform completion (when mouse is released)
    this.transformControls.addEventListener('mouseUp', () => {
      this.handleTransformCompleted();
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

  private setOrbitEnabled(enabled: boolean): void {
    if (this.orbitControls) {
      this.orbitControls.enabled = enabled;
    }
  }

  begin2DInteraction(): void {
    this.orbitLocked = true;
    this.setOrbitEnabled(false);
  }

  end2DInteraction(): void {
    this.orbitLocked = false;
    this.setOrbitEnabled(true);
  }

  resize(width: number, height: number): void {
    if (!this.renderer || !this.camera) return;

    this.viewportSize = { width, height };

    const pixelWidth = Math.ceil(width * window.devicePixelRatio);
    const pixelHeight = Math.ceil(height * window.devicePixelRatio);

    this.renderer.setSize(pixelWidth, pixelHeight, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    // Update orthographic camera to match viewport aspect ratio
    if (this.orthographicCamera) {
      const aspectRatio = width / height;
      const viewHeight = 10;
      const viewWidth = viewHeight * aspectRatio;
      this.orthographicCamera.left = -viewWidth / 2;
      this.orthographicCamera.right = viewWidth / 2;
      this.orthographicCamera.top = viewHeight / 2;
      this.orthographicCamera.bottom = -viewHeight / 2;
      this.orthographicCamera.updateProjectionMatrix();
    }
  }

  setTransformMode(mode: TransformMode): void {
    // Set the transform mode for the gizmo
    this.currentTransformMode = mode;

    if (mode === 'select') {
      // In select mode, hide the transform gizmo
      if (this.transformGizmo && this.scene) {
        this.scene.remove(this.transformGizmo);
        this.transformGizmo = undefined;
      }
      // Detach from current object
      if (this.transformControls) {
        this.transformControls.detach();
      }
    } else if (this.transformControls) {
      // In transform modes, set the mode on TransformControls
      this.transformControls.setMode(mode);

      // Reattach to the selected object if there is one
      const { nodeIds } = appState.selection;
      const activeSceneId = appState.scenes.activeSceneId;

      if (nodeIds.length > 0 && activeSceneId) {
        const sceneGraph = this.sceneManager.getSceneGraph(activeSceneId);
        if (sceneGraph) {
          // Find the first selected node
          const firstSelectedNodeId = nodeIds[0];
          const firstSelectedNode = this.findNodeById(firstSelectedNodeId, sceneGraph.rootNodes);

          if (firstSelectedNode && firstSelectedNode instanceof Node3D) {
            // Attach transform controls to the selected object
            this.transformControls.attach(firstSelectedNode);

            // Add the transform gizmo to the scene
            if (this.scene) {
              this.transformGizmo = this.transformControls.getHelper();
              this.transformGizmo.userData.isTransformGizmo = true;
              this.transformGizmo.traverse(child => {
                child.userData.isTransformGizmo = true;
              });
              this.scene.add(this.transformGizmo);
            }
          }
        }
      }
    }
  }

  /**
   * Raycast from camera through screen position and find the deepest NodeBase object.
   * Excludes locked nodes from selection.
   * @param screenX Normalized screen X coordinate (0 to 1)
   * @param screenY Normalized screen Y coordinate (0 to 1)
   * @returns The deepest NodeBase object under the pointer, or null if none found
   */
  raycastObject(screenX: number, screenY: number): NodeBase | null {
    if (!this.scene || !this.renderer) {
      return null;
    }

    const pixelX = screenX * this.viewportSize.width;
    const pixelY = screenY * this.viewportSize.height;
    const hit2D = this.raycast2D(pixelX, pixelY);
    if (hit2D) {
      console.debug('[ViewportRenderer] 2D hit', hit2D.nodeId, 'at', { pixelX, pixelY });
      return hit2D;
    }

    if (!this.camera) {
      return null;
    }

    // Create raycaster and convert screen coordinates to normalized device coordinates
    const raycaster = new THREE.Raycaster();
    console.debug('[ViewportRenderer] 3D raycast fallback at', { pixelX, pixelY });
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
    // Skip locked nodes
    for (const intersection of intersects) {
      let current: THREE.Object3D | null = intersection.object;

      // Traverse up the hierarchy to find the deepest NodeBase
      while (current) {
        if (current instanceof NodeBase) {
          // Skip locked nodes - they cannot be selected by pointer
          const isLocked = Boolean((current as any).properties?.locked);
          if (!isLocked) {
            return current;
          }
        }
        current = current.parent;
      }
    }

    return null;
  }

  private raycast2D(pixelX: number, pixelY: number): NodeBase | null {
    if (!this.orthographicCamera || !appState.ui.showLayer2D) {
      return null;
    }

    const mouse = this.toNdc(pixelX, pixelY);
    if (!mouse) {
      return null;
    }

    const raycaster = new THREE.Raycaster();
    raycaster.params.Line.threshold = 0.5;
    raycaster.layers.set(1);
    raycaster.setFromCamera(mouse, this.orthographicCamera);

    const candidates: THREE.Object3D[] = [
      ...this.group2DMeshes.values(),
      ...this.sprite2DMeshes.values(),
    ];

    console.debug('[ViewportRenderer] 2D raycast candidates', {
      count: candidates.length,
      nodeIds: candidates.map(c => c.userData?.nodeId).filter(Boolean),
      mouse,
    });

    const intersects = raycaster.intersectObjects(candidates, true);
    console.debug('[ViewportRenderer] 2D raycast intersects', intersects.map(i => ({
      nodeId: i.object.userData?.nodeId,
      distance: i.distance,
      point: i.point,
    })));
    if (!intersects.length) {
      console.debug('[ViewportRenderer] 2D raycast miss at', { pixelX, pixelY });
      return null;
    }

    const nodeId = (intersects[0].object.userData?.nodeId as string | undefined) ?? null;
    if (!nodeId) {
      return null;
    }

    const activeSceneId = appState.scenes.activeSceneId;
    if (!activeSceneId) {
      return null;
    }

    const sceneGraph = this.sceneManager.getSceneGraph(activeSceneId);
    if (!sceneGraph) {
      return null;
    }

    const node = sceneGraph.nodeMap.get(nodeId);
    if (node instanceof NodeBase) {
      const isLocked = Boolean((node as any).properties?.locked);
      if (isLocked) {
        console.debug('[ViewportRenderer] 2D hit on locked node', nodeId);
        return null;
      }
      return node;
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
    } else if (node instanceof Group2D) {
      // Update Group2D visual representation transform
      const mesh = this.group2DMeshes.get(node.nodeId);
      if (mesh) {
        mesh.position.copy(node.position);
        mesh.rotation.copy(node.rotation);
        mesh.scale.copy(node.scale);
      }
    } else if (node instanceof Sprite2D) {
      // Update Sprite2D visual representation transform
      const mesh = this.sprite2DMeshes.get(node.nodeId);
      if (mesh) {
        mesh.position.copy(node.position);
        mesh.rotation.copy(node.rotation);
        mesh.scale.copy(node.scale);
      }
    }

    if (node instanceof Node2D && this.selection2DOverlay?.nodeId === node.nodeId) {
      this.update2DSelectionOverlay(node.nodeId);
    }
  }

  updateNodeVisibility(node: NodeBase): void {
    // Handle visibility changes for 2D nodes (Group2D and Sprite2D)
    if (node instanceof Group2D) {
      const mesh = this.group2DMeshes.get(node.nodeId);
      if (mesh) {
        if (node.visible) {
          // Show the mesh
          if (!mesh.parent && this.scene) {
            this.scene.add(mesh);
          }
        } else {
          // Hide the mesh
          if (mesh.parent) {
            mesh.parent.remove(mesh);
          }
        }
      }
    } else if (node instanceof Sprite2D) {
      const mesh = this.sprite2DMeshes.get(node.nodeId);
      if (mesh) {
        if (node.visible) {
          // Show the mesh
          if (!mesh.parent && this.scene) {
            this.scene.add(mesh);
          }
        } else {
          // Hide the mesh
          if (mesh.parent) {
            mesh.parent.remove(mesh);
          }
        }
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
    let selected2DNodeId: string | null = null;
    for (const nodeId of nodeIds) {
      const node = this.findNodeById(nodeId, sceneGraph.rootNodes);
      if (node && node instanceof Node3D) {
        this.selectedObjects.add(node);

        if (!firstSelectedNode) {
          firstSelectedNode = node;
        }

        const box = new THREE.Box3().setFromObject(node);
        const helper = new THREE.Box3Helper(box, new THREE.Color(0x00ff00));
        helper.userData.selectionBoxId = nodeId;
        helper.userData.isSelectionBox = true;
        this.selectionBoxes.set(nodeId, helper);
        this.scene?.add(helper);
      } else if (node && node instanceof Node2D && !selected2DNodeId) {
        selected2DNodeId = nodeId;
      }
    }

    if (selected2DNodeId) {
      this.update2DSelectionOverlay(selected2DNodeId);
    } else {
      this.clear2DSelectionOverlay();
    }

    // Attach transform controls to the first selected node if any
    // (but only if not in select mode)
    if (
      firstSelectedNode &&
      this.transformControls &&
      this.scene &&
      this.currentTransformMode !== 'select'
    ) {
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

      // Clean up previous Group2D meshes
      for (const mesh of this.group2DMeshes.values()) {
        if (this.scene) {
          this.scene.remove(mesh);
        }
        mesh.geometry.dispose();
        if (mesh.material instanceof THREE.Material) {
          mesh.material.dispose();
        } else if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        }
      }
      this.group2DMeshes.clear();

      // Clean up previous Sprite2D meshes
      for (const mesh of this.sprite2DMeshes.values()) {
        if (this.scene) {
          this.scene.remove(mesh);
        }
        mesh.geometry.dispose();
        if (mesh.material instanceof THREE.Material) {
          mesh.material.dispose();
        } else if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        }
      }
      this.sprite2DMeshes.clear();

      // Remove all root nodes from scene (except lights and helpers)
      const objectsToRemove: THREE.Object3D[] = [];
      this.scene.children.forEach(child => {
        // Keep lights and grid
        if (!(child instanceof THREE.Light) && !(child instanceof THREE.GridHelper)) {
          objectsToRemove.push(child);
        }
      });

      objectsToRemove.forEach(obj => this.scene!.remove(obj));

      // Add scene graph root nodes and create visual representations for Group2D
      sceneGraph.rootNodes.forEach(node => {
        this.processNodeForRendering(node);
      });

      this.updateSelection();
    } catch (err) {
      console.error('[ViewportRenderer] Error syncing scene content:', err);
    }
  }

  /**
   * Process a node and its children for rendering.
   * Creates visual representations for Group2D nodes and Sprite2D nodes.
   */
  private processNodeForRendering(node: NodeBase): void {
    if (!this.scene) return;

    // Add 3D nodes to the scene with layer 0
    if (node instanceof Node3D && !node.parent) {
      this.scene.add(node);
      node.layers.set(0); // 3D nodes use layer 0
    }

    // Create visual representation for Group2D nodes with layer 1
    if (node instanceof Group2D) {
      const mesh = this.createGroup2DVisual(node);
      mesh.layers.set(1); // 2D visuals use layer 1
      this.group2DMeshes.set(node.nodeId, mesh);
      // Only add to scene if the node is visible
      if (node.visible) {
        this.scene.add(mesh);
      }
    }

    // Create visual representation for Sprite2D nodes with layer 1
    if (node instanceof Sprite2D) {
      const mesh = this.createSprite2DVisual(node);
      mesh.layers.set(1); // 2D visuals use layer 1
      this.sprite2DMeshes.set(node.nodeId, mesh);
      // Only add to scene if the node is visible
      if (node.visible) {
        this.scene.add(mesh);
      }
    }

    // Recursively process children
    for (const child of node.children) {
      this.processNodeForRendering(child);
    }
  }

  /**
   * Create a rectangle outline visual representation for a Group2D node.
   */
  private createGroup2DVisual(node: Group2D): THREE.LineSegments {
    const width = node.width;
    const height = node.height;

    // Create rectangle geometry centered at origin
    const points: THREE.Vector3[] = [
      new THREE.Vector3(-width / 2, -height / 2, 0),
      new THREE.Vector3(width / 2, -height / 2, 0),
      new THREE.Vector3(width / 2, height / 2, 0),
      new THREE.Vector3(-width / 2, height / 2, 0),
      new THREE.Vector3(-width / 2, -height / 2, 0), // Close the loop
    ];

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.computeBoundingBox();

    // Create line material with 2D node color
    const material = new THREE.LineBasicMaterial({
      color: 0x96cbf6, // NODE_2D_COLOR
      linewidth: 2,
    });

    const line = new THREE.LineSegments(geometry, material);

    // Apply the node's transform
    line.position.copy(node.position);
    line.rotation.copy(node.rotation);
    line.scale.copy(node.scale);

    // Mark as editor visual
    line.userData.isGroup2DVisual = true;
    line.userData.nodeId = node.nodeId;

    return line;
  }

  /**
   * Create a highlighted selection box for a Group2D node.
   */
  private createGroup2DSelectionBox(node: Group2D): THREE.LineSegments {
    const width = node.width;
    const height = node.height;

    // Create rectangle geometry centered at origin with highlight color
    const points: THREE.Vector3[] = [
      new THREE.Vector3(-width / 2, -height / 2, 0),
      new THREE.Vector3(width / 2, -height / 2, 0),
      new THREE.Vector3(width / 2, height / 2, 0),
      new THREE.Vector3(-width / 2, height / 2, 0),
      new THREE.Vector3(-width / 2, -height / 2, 0), // Close the loop
    ];

    const geometry = new THREE.BufferGeometry().setFromPoints(points);

    // Create line material with highlight color (green for selection)
    const material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      linewidth: 3,
    });

    const line = new THREE.LineSegments(geometry, material);

    // Apply the node's transform
    line.position.copy(node.position);
    line.rotation.copy(node.rotation);
    line.scale.copy(node.scale);

    // Mark as selection box
    line.userData.isGroup2DSelectionBox = true;
    line.userData.nodeId = node.nodeId;

    return line;
  }

  /**
   * Create a visual representation for a Sprite2D node.
   * Renders the texture if available, or a placeholder rectangle if not.
   */
  private createSprite2DVisual(node: Sprite2D): THREE.Mesh {
    // Default size for placeholder
    const size = 64;

    // Create a plane geometry to hold the sprite texture
    const geometry = new THREE.PlaneGeometry(size, size);
    geometry.computeBoundingBox();

    let material: THREE.Material;

    // Try to load texture if available; if it references a templ:// or res:// URL,
    // use ResourceManager to resolve it to a Blob and create an object URL for the TextureLoader.
    const textureLoader = new THREE.TextureLoader();
    if (node.texturePath) {
      // Use a placeholder material immediately, and patch in the texture asynchronously
      material = new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide });

      // Asynchronously resolve resource to a Blob using ResourceManager
      (async () => {
        const texturePath = node.texturePath as string;
        try {
          const blob = await this.resourceManager.readBlob(texturePath);
          const blobUrl = URL.createObjectURL(blob);

          // Load texture from object URL and patch material when loaded
            textureLoader.load(
            blobUrl,
            texture => {
              try {
                if (material instanceof THREE.MeshBasicMaterial) {
                  material.map = texture;
                  material.color.set(0xffffff);
                  material.needsUpdate = true;
                }
              } finally {
                // Revoke the object URL once the texture has been decoded
                try {
                  URL.revokeObjectURL(blobUrl);
                } catch {
                  // ignore
                }
              }
            },
            undefined,
            err => {
              // Loading error — keep placeholder material
              console.warn('[ViewportRenderer] Failed to load sprite texture', node.texturePath, err);
              try {
                URL.revokeObjectURL(blobUrl);
              } catch {
                // ignore
              }
            }
          );
          } catch (err) {
            // failed to fetch blob via ResourceManager — only attempt direct load for http/https or no-scheme paths.
            const schemeMatch = /^([a-z]+[a-z0-9+.-]*):\/\//i.exec(texturePath);
            const scheme = schemeMatch ? schemeMatch[1].toLowerCase() : '';

            if (scheme === 'http' || scheme === 'https' || scheme === '') {
              try {
                const texture = textureLoader.load(texturePath, undefined, undefined, e => {
                  console.warn('[ViewportRenderer] Direct texture load failed', node.texturePath, e);
                });
                if (texture) {
                  if (material instanceof THREE.MeshBasicMaterial) {
                    material.map = texture;
                    material.color.set(0xffffff);
                    material.needsUpdate = true;
                  }
                }
              } catch (err2) {
                console.warn('[ViewportRenderer] Failed to load texture for', node.texturePath, err2);
              }
            } else {
              // If the scheme is templ:// or res://, avoid direct load (these schemes are handled by ResourceManager)
              console.warn('[ViewportRenderer] Skipping direct load for unsupported scheme:', texturePath);
            }
          }
      })();
    } else {
      // No texture path - use placeholder material (light gray)
      material = new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
    }

    const mesh = new THREE.Mesh(geometry, material);

    // Apply the node's transform (2D space within parent Group2D)
    mesh.position.copy(node.position);
    mesh.rotation.copy(node.rotation);
    mesh.scale.copy(node.scale);

    // Mark as Sprite2D visual for identification
    mesh.userData.isSprite2DVisual = true;
    mesh.userData.nodeId = node.nodeId;

    return mesh;
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

  private clear2DSelectionOverlay(): void {
    if (!this.selection2DOverlay || !this.scene) {
      this.selection2DOverlay = undefined;
      return;
    }

    const { group } = this.selection2DOverlay;
    this.scene.remove(group);
    group.traverse(obj => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        obj.geometry?.dispose();
        if (obj.material instanceof THREE.Material) {
          obj.material.dispose();
        }
      }
    });
    this.selection2DOverlay = undefined;
    this.active2DTransform = undefined;
    this.end2DInteraction();
    console.debug('[ViewportRenderer] cleared 2D overlay');
  }

  private update2DSelectionOverlay(nodeId: string): void {
    if (!this.scene || !this.orthographicCamera) {
      return;
    }

    const activeSceneId = appState.scenes.activeSceneId;
    if (!activeSceneId) {
      this.clear2DSelectionOverlay();
      return;
    }

    const sceneGraph = this.sceneManager.getSceneGraph(activeSceneId);
    if (!sceneGraph) {
      this.clear2DSelectionOverlay();
      return;
    }

    const node = sceneGraph.nodeMap.get(nodeId);
    if (!node || !(node instanceof Node2D)) {
      this.clear2DSelectionOverlay();
      return;
    }

    const visual = this.get2DVisual(node);
    if (!visual) {
      this.clear2DSelectionOverlay();
      return;
    }

    const bounds = new THREE.Box3().setFromObject(visual);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const baseSize = this.getBaseSizeFor2D(visual);

    this.clear2DSelectionOverlay();

    const frame = this.create2DFrame(bounds);
    const handles = this.create2DHandles(bounds);
    const group = new THREE.Group();
    group.add(frame, ...handles);
    group.renderOrder = 1000;
    group.layers.set(1);
    this.scene.add(group);

    this.selection2DOverlay = {
      group,
      handles,
      frame,
      nodeId,
      anchorWorld: bounds.min.clone(),
      anchorLocal: new THREE.Vector3(-size.x / 2, -size.y / 2, 0),
      baseSize,
      startSize: new THREE.Vector2(size.x, size.y),
      centerWorld: center,
      rotationHandle: handles.find(h => h.userData?.handleType === 'rotate'),
      bounds,
    };
  }

  private create2DFrame(bounds: THREE.Box3): THREE.LineSegments {
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

  private create2DHandles(bounds: THREE.Box3): THREE.Object3D[] {
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

    const handleSize = Math.max(max.x - min.x, max.y - min.y) * 0.04 + 0.1;
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
    (Object.entries(positions) as Array<[Exclude<TwoDHandle, 'idle' | 'move'>, THREE.Vector3]>).forEach(
      ([type, pos]) => {
        const mesh = new THREE.Mesh(handleGeometry.clone(), type === 'rotate' ? rotationMaterial.clone() : handleMaterial.clone());
        mesh.position.copy(pos);
        mesh.userData.handleType = type;
        mesh.renderOrder = 1100;
        mesh.layers.set(1);
        handles.push(mesh);
      }
    );

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

  get2DHandleAt(screenX: number, screenY: number): TwoDHandle {
    if (!this.selection2DOverlay || !this.orthographicCamera) {
      return 'idle';
    }

    const mouse = this.toNdc(screenX, screenY);
    if (!mouse) {
      return 'idle';
    }

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.orthographicCamera);
    const hits = raycaster.intersectObjects(this.selection2DOverlay.handles, true);
    if (hits.length) {
      const handleType = hits[0].object.userData?.handleType as TwoDHandle | undefined;
      return handleType ?? 'idle';
    }

    const point = this.screenToWorld2D(screenX, screenY);
    if (point && this.selection2DOverlay.bounds.containsPoint(point)) {
      return 'move';
    }

    return 'idle';
  }

  has2DTransform(): boolean {
    return this.active2DTransform !== undefined;
  }

  start2DTransform(screenX: number, screenY: number, handle: TwoDHandle): void {
    if (!this.selection2DOverlay || !this.orthographicCamera) {
      return;
    }

    const activeSceneId = appState.scenes.activeSceneId;
    if (!activeSceneId) return;
    const sceneGraph = this.sceneManager.getSceneGraph(activeSceneId);
    if (!sceneGraph) return;

    const node = sceneGraph.nodeMap.get(this.selection2DOverlay.nodeId);
    if (!node || !(node instanceof Node2D)) {
      return;
    }

    const visual = this.get2DVisual(node);
    if (!visual) return;

    const pointerWorld = this.screenToWorld2D(screenX, screenY);
    if (!pointerWorld) return;

    const baseSize = this.selection2DOverlay.baseSize.clone();
    const startSize = this.selection2DOverlay.startSize.clone();
    const startScale = new THREE.Vector2(node.scale.x, node.scale.y);
    const startRotation = node.rotation.z;
    const anchorLocal = this.getAnchorLocal(handle, startSize);
    const centerWorld = visual.getWorldPosition(new THREE.Vector3());
    const rotationMatrix = this.rotationMatrix(startRotation);
    const anchorWorld = anchorLocal.clone().applyMatrix3(rotationMatrix).add(centerWorld);

    const startState: Transform2DState = {
      position: { x: node.position.x, y: node.position.y },
      rotation: MathUtils.radToDeg(startRotation),
      scale: { x: startScale.x, y: startScale.y },
    };

    this.active2DTransform = {
      nodeId: node.nodeId,
      handle,
      startPointerWorld: pointerWorld,
      startPosition: node.position.clone(),
      startRotation,
      startState,
      baseSize,
      startSize,
      anchorWorld,
      anchorLocal,
      startCenterWorld: centerWorld,
    };

    this.begin2DInteraction();
    console.debug('[ViewportRenderer] start 2D transform', { handle, nodeId: node.nodeId, pointerWorld });
  }

  update2DTransform(screenX: number, screenY: number): void {
    if (!this.active2DTransform) {
      return;
    }

    const activeSceneId = appState.scenes.activeSceneId;
    if (!activeSceneId) return;
    const sceneGraph = this.sceneManager.getSceneGraph(activeSceneId);
    if (!sceneGraph) return;

    const node = sceneGraph.nodeMap.get(this.active2DTransform.nodeId);
    if (!node || !(node instanceof Node2D)) {
      return;
    }

    const visual = this.get2DVisual(node);
    if (!visual) return;

    const pointerWorld = this.screenToWorld2D(screenX, screenY);
    if (!pointerWorld) return;

    const { handle, startPointerWorld, startPosition, startRotation, baseSize, startSize, anchorWorld, anchorLocal, startCenterWorld } =
      this.active2DTransform;

    if (handle === 'move') {
      const delta = pointerWorld.clone().sub(startPointerWorld);
      node.position.set(startPosition.x + delta.x, startPosition.y + delta.y, node.position.z);
    } else if (handle === 'rotate') {
      const startAngle = Math.atan2(startPointerWorld.y - startCenterWorld.y, startPointerWorld.x - startCenterWorld.x);
      const currentAngle = Math.atan2(pointerWorld.y - startCenterWorld.y, pointerWorld.x - startCenterWorld.x);
      const delta = currentAngle - startAngle;
      node.rotation.set(0, 0, startRotation + delta);
    } else {
      const rotationMatrix = this.rotationMatrix(startRotation);
      const rotationInverse = this.rotationMatrix(-startRotation);
      const localPoint = pointerWorld
        .clone()
        .sub(startCenterWorld)
        .applyMatrix3(rotationInverse);

      let width = startSize.x;
      let height = startSize.y;

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
        width = Math.max(this.min2DSize, Math.abs(localPoint.x - anchorLocal.x));
      }

      if (affectsY) {
        height = Math.max(this.min2DSize, Math.abs(localPoint.y - anchorLocal.y));
      }

      const scaleX = width / baseSize.x;
      const scaleY = height / baseSize.y;

      const anchorLocalNew = this.getAnchorLocal(handle, new THREE.Vector2(width, height));
      const anchorOffsetWorld = anchorLocalNew.clone().applyMatrix3(rotationMatrix);
      const newCenterWorld = anchorWorld.clone().sub(anchorOffsetWorld);

      node.position.set(newCenterWorld.x, newCenterWorld.y, node.position.z);
      node.scale.set(scaleX, scaleY, 1);
      console.debug('[ViewportRenderer] 2D scale', { nodeId: node.nodeId, scaleX, scaleY, newCenterWorld });
    }

    this.updateNodeTransform(node);
  }

  async complete2DTransform(): Promise<void> {
    if (!this.active2DTransform) {
      return;
    }

    const { nodeId, startState } = this.active2DTransform;
    const sceneGraph = this.sceneManager.getActiveSceneGraph();
    if (!sceneGraph) {
      this.active2DTransform = undefined;
      this.end2DInteraction();
      return;
    }

    const node = sceneGraph.nodeMap.get(nodeId);
    if (!node || !(node instanceof Node2D)) {
      this.active2DTransform = undefined;
      this.end2DInteraction();
      return;
    }

    // Ensure orbit stays disabled until after we push the op
    this.begin2DInteraction();

    const currentState: Transform2DState = {
      position: { x: node.position.x, y: node.position.y },
      rotation: MathUtils.radToDeg(node.rotation.z),
      scale: { x: node.scale.x, y: node.scale.y },
    };

    const op = new Transform2DCompleteOperation({
      nodeId,
      previousState: startState,
      currentState,
    });

    await this.operationService.invokeAndPush(op);
    this.active2DTransform = undefined;
    this.end2DInteraction();
    this.update2DSelectionOverlay(nodeId);
    console.debug('[ViewportRenderer] complete 2D transform', { nodeId });
  }

  private toNdc(screenX: number, screenY: number): THREE.Vector2 | null {
    const { width, height } = this.viewportSize;
    if (width <= 0 || height <= 0) return null;
    return new THREE.Vector2((screenX / width) * 2 - 1, -(screenY / height) * 2 + 1);
  }

  private screenToWorld2D(screenX: number, screenY: number): THREE.Vector3 | null {
    if (!this.orthographicCamera) return null;
    const ndc = this.toNdc(screenX, screenY);
    if (!ndc) return null;
    const point = new THREE.Vector3(ndc.x, ndc.y, 0);
    point.unproject(this.orthographicCamera);
    return point;
  }

  private get2DVisual(node: Node2D): THREE.Object3D | undefined {
    if (node instanceof Group2D) {
      return this.group2DMeshes.get(node.nodeId);
    }
    if (node instanceof Sprite2D) {
      return this.sprite2DMeshes.get(node.nodeId);
    }
    return undefined;
  }

  private getBaseSizeFor2D(visual: THREE.Object3D): THREE.Vector2 {
    const box = new THREE.Box3().setFromObject(visual);
    const size = box.getSize(new THREE.Vector3());
    return new THREE.Vector2(size.x / (visual.scale.x || 1), size.y / (visual.scale.y || 1));
  }

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

  private rotationMatrix(angle: number): THREE.Matrix3 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new THREE.Matrix3().set(c, -s, 0, s, c, 0, 0, 0, 1);
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

        // Render main scene with perspective camera (3D layer only)
        this.renderer.autoClear = true;
        this.renderer.render(this.scene, this.camera);

        // Render 2D layer with orthographic camera if enabled
        if (appState.ui.showLayer2D && this.orthographicCamera) {
          // Save and remove scene background to prevent it from overwriting 3D content
          const savedBackground = this.scene.background;
          this.scene.background = null;
          
          this.renderer.autoClear = false;
          this.renderer.clearDepth();
          this.renderer.render(this.scene, this.orthographicCamera);
          
          // Restore scene background and autoClear for next frame
          this.scene.background = savedBackground;
          this.renderer.autoClear = true;
        }
      }
    };

    render();
  }

  private captureTransformStartState(obj: THREE.Object3D): void {
    if (!(obj instanceof Node3D)) {
      return;
    }

    const nodeId = obj.nodeId;
    this.transformStartStates.set(nodeId, {
      position: obj.position.clone(),
      rotation: obj.rotation.clone(),
      scale: obj.scale.clone(),
    });
  }

  private async handleTransformCompleted(): Promise<void> {
    if (!this.transformControls?.object || !(this.transformControls.object instanceof Node3D)) {
      this.transformStartStates.clear();
      return;
    }

    const node = this.transformControls.object;
    const nodeId = node.nodeId;
    const startState = this.transformStartStates.get(nodeId);

    if (!startState) {
      this.transformStartStates.clear();
      return;
    }

    try {
      // Build current state
      const currentState: TransformState = {
        position: {
          x: node.position.x,
          y: node.position.y,
          z: node.position.z,
        },
        rotation: {
          x: MathUtils.radToDeg(node.rotation.x),
          y: MathUtils.radToDeg(node.rotation.y),
          z: MathUtils.radToDeg(node.rotation.z),
        },
        scale: {
          x: node.scale.x,
          y: node.scale.y,
          z: node.scale.z,
        },
      };

      // Convert start state rotation to degrees for comparison
      const previousState: TransformState = {
        position: startState.position,
        rotation: {
          x: MathUtils.radToDeg(startState.rotation.x),
          y: MathUtils.radToDeg(startState.rotation.y),
          z: MathUtils.radToDeg(startState.rotation.z),
        },
        scale: startState.scale,
      };

      // Create and push transform operation with before/after states
      const operation = new TransformCompleteOperation({
        nodeId,
        previousState,
        currentState,
      });

      await this.operationService.invokeAndPush(operation);
    } catch (error) {
      console.error('[ViewportRenderer] Error handling transform completion:', error);
    } finally {
      this.transformStartStates.clear();
    }
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

    // Dispose Group2D visual meshes
    this.group2DMeshes.forEach(mesh => {
      mesh.geometry.dispose();
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      } else if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      }
    });
    this.group2DMeshes.clear();

    this.clear2DSelectionOverlay();

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
    this.orthographicCamera = undefined;
    this.orbitControls = undefined;
    this.transformControls = undefined;
    this.transformGizmo = undefined;
  }
}
