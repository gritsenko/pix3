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
import { NodeBase } from '@pix3/runtime';
import { Node2D } from '@pix3/runtime';
import { Node3D } from '@pix3/runtime';
import { Group2D } from '@pix3/runtime';
import { Sprite2D } from '@pix3/runtime';
import { DirectionalLightNode } from '@pix3/runtime';
import { PointLightNode } from '@pix3/runtime';
import { SpotLightNode } from '@pix3/runtime';
import { Camera3D } from '@pix3/runtime';
import { injectable, inject } from '@/fw/di';
import { SceneManager } from '@pix3/runtime';
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
import {
  TransformTool2d,
  type TwoDHandle,
  type Active2DTransform,
  type Selection2DOverlay,
} from '@/services/TransformTool2d';

export type TransformMode = 'select' | 'translate' | 'rotate' | 'scale';

const LAYER_3D = 0;
const LAYER_2D = 1;
const LAYER_GIZMOS = 2;

@injectable()
export class ViewportRendererService {
  @inject(SceneManager)
  private readonly sceneManager!: SceneManager;

  @inject(OperationService)
  private readonly operationService!: OperationService;

  @inject(ResourceManager)
  private readonly resourceManager!: ResourceManager;

  private renderer?: THREE.WebGLRenderer;
  private canvas?: HTMLCanvasElement;
  private canvasHost?: HTMLElement;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private orthographicCamera?: THREE.OrthographicCamera;
  private orbitControls?: OrbitControls;
  private transformControls?: TransformControls;
  private transformGizmo?: THREE.Object3D;
  private currentTransformMode: TransformMode = 'select';
  private selectedObjects = new Set<THREE.Object3D>();
  private selectionBoxes = new Map<string, THREE.Box3Helper>();
  private selectionGizmos = new Map<string, THREE.Object3D>();
  private previewCamera: THREE.Camera | null = null;
  private group2DVisuals = new Map<string, THREE.Group>();
  private sprite2DVisuals = new Map<string, THREE.Group>();
  private selection2DOverlay?: Selection2DOverlay;
  private active2DTransform?: Active2DTransform;
  // Hover preview frame for 2D nodes (before selection)
  private hoverPreview2D?: { nodeId: string; frame: THREE.LineSegments };
  private animationId?: number;
  private pollIntervalId?: number;
  private isPaused = true;
  private disposers: Array<() => void> = [];
  private gridHelper?: THREE.GridHelper;
  private transformStartStates = new Map<
    string,
    { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }
  >();
  private lastActiveSceneId: string | null = null;
  private viewportSize = { width: 0, height: 0 };
  private transformTool2d: TransformTool2d;

  constructor() {
    this.transformTool2d = new TransformTool2d();
  }

  private disposeObject3D(root: THREE.Object3D): void {
    root.traverse(obj => {
      if (
        obj instanceof THREE.Mesh ||
        obj instanceof THREE.LineSegments ||
        obj instanceof THREE.Line
      ) {
        obj.geometry?.dispose();
        const material = (obj as THREE.Mesh).material as
          | THREE.Material
          | THREE.Material[]
          | undefined;
        if (material instanceof THREE.Material) {
          material.dispose();
        } else if (Array.isArray(material)) {
          material.forEach(m => m.dispose());
        }
      }
    });
  }

  /**
   * Backwards-compatible initialization. Prefer calling attachToHost() which will
   * ensure a single shared renderer + canvas instance.
   */
  initialize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ensureInitialized();
  }

  /**
   * Ensure the renderer is initialized exactly once.
   * If no canvas was provided, a new canvas will be created.
   */
  ensureInitialized(): void {
    if (this.renderer) {
      return;
    }

    const canvas = this.canvas ?? document.createElement('canvas');
    this.canvas = canvas;
    if (!canvas.classList.contains('viewport-canvas')) {
      canvas.classList.add('viewport-canvas');
    }

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

    // Set up camera layers: layer 0 for 3D nodes, layer 1 for 2D nodes, layer 2 for gizmos
    // Main perspective camera renders 3D layer and gizmos
    this.camera.layers.disableAll();
    this.camera.layers.enable(LAYER_3D);
    this.camera.layers.enable(LAYER_GIZMOS);

    // Create orthographic camera for 2D layer overlay
    this.orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.orthographicCamera.position.z = 100;
    // Orthographic camera only renders 2D layer
    this.orthographicCamera.layers.disableAll();
    this.orthographicCamera.layers.enable(LAYER_2D);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    this.scene.add(directionalLight);

    // Add grid helper for reference
    this.gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    this.scene.add(this.gridHelper);

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
    this.transformControls.addEventListener('dragging-changed', (event: { value: unknown }) => {
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

    // Render loop will start on first attach/resume

    // Poll active scene ID for changes (avoid subscribing to entire scenes object to prevent feedback loops)
    const checkSceneChanges = () => {
      const currentSceneId = appState.scenes.activeSceneId;
      if (currentSceneId !== this.lastActiveSceneId) {
        this.lastActiveSceneId = currentSceneId;
        this.syncSceneContent();
      }
    };

    this.pollIntervalId = window.setInterval(checkSceneChanges, 100);
    this.disposers.push(() => {
      if (this.pollIntervalId) {
        clearInterval(this.pollIntervalId);
        this.pollIntervalId = undefined;
      }
    });

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

    // Subscribe to grid visibility changes
    const unsubscribeGrid = subscribe(appState.ui, () => {
      this.toggleGrid();
    });
    this.disposers.push(unsubscribeGrid);

    // Initial sync
    checkSceneChanges();
  }

  getCanvasElement(): HTMLCanvasElement | undefined {
    return this.canvas;
  }

  /**
   * Attach the shared canvas to a host element. The canvas will be physically
   * moved in the DOM to avoid multiple WebGL contexts.
   */
  attachToHost(host: HTMLElement): void {
    this.ensureInitialized();
    if (!this.canvas || !this.renderer) return;

    if (this.canvasHost !== host) {
      this.canvasHost = host;
      try {
        host.appendChild(this.canvas);
      } catch {
        // ignore
      }
    }

    // Ensure controls point at the active dom element.
    try {
      this.orbitControls?.connect(this.renderer.domElement);

      if (this.scene && this.transformControls) {
        try {
          this.scene.remove(this.transformControls as unknown as THREE.Object3D);
        } catch {
          // ignore
        }
      }

      this.transformControls?.dispose();
      if (this.camera) {
        this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
        const mode: 'translate' | 'rotate' | 'scale' =
          this.currentTransformMode === 'rotate'
            ? 'rotate'
            : this.currentTransformMode === 'scale'
              ? 'scale'
              : 'translate';
        this.transformControls.setMode(mode);
        this.transformControls.size = 0.6;
        this.transformControls.addEventListener('dragging-changed', (event: { value: unknown }) => {
          this.setOrbitEnabled(!event.value);
          if (event.value && this.transformControls?.object) {
            this.captureTransformStartState(this.transformControls.object);
          }
        });
        this.transformControls.addEventListener('objectChange', () => {
          this.updateSelectionBoxes();
        });
        this.transformControls.addEventListener('mouseUp', () => {
          this.handleTransformCompleted();
        });

        // TransformControls is a control object, not a Three.js object,
        // so we don't add it to the scene. It is attached to the DOM via attach() method.
      }
    } catch {
      // ignore
    }

    this.resume();
  }

  pause(): void {
    this.isPaused = true;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = undefined;
    }
  }

  resume(): void {
    if (!this.renderer) {
      this.ensureInitialized();
    }
    if (!this.renderer) return;

    if (!this.isPaused) return;
    this.isPaused = false;
    this.startRenderLoop();
  }

  captureCameraState(): {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    zoom?: number;
  } | null {
    if (!this.camera || !this.orbitControls) return null;
    const position = this.camera.position;
    const target = this.orbitControls.target;
    return {
      position: { x: position.x, y: position.y, z: position.z },
      target: { x: target.x, y: target.y, z: target.z },
      zoom: this.camera.zoom,
    };
  }

  applyCameraState(state: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    zoom?: number;
  }): void {
    this.ensureInitialized();
    if (!this.camera || !this.orbitControls) return;

    this.camera.position.set(state.position.x, state.position.y, state.position.z);
    this.orbitControls.target.set(state.target.x, state.target.y, state.target.z);
    if (typeof state.zoom === 'number') {
      this.camera.zoom = state.zoom;
      this.camera.updateProjectionMatrix();
    }
    this.orbitControls.update();
  }

  private setOrbitEnabled(enabled: boolean): void {
    if (this.orbitControls) {
      this.orbitControls.enabled = enabled;
    }
  }

  begin2DInteraction(): void {
    this.setOrbitEnabled(false);
  }

  end2DInteraction(): void {
    this.setOrbitEnabled(true);
  }

  toggleGrid(): void {
    if (this.gridHelper && this.gridHelper) {
      this.gridHelper.visible = appState.ui.showGrid;
    }
  }

  zoomDefault(): void {
    if (!this.camera || !this.orbitControls) return;
    this.camera.position.set(5, 5, 5);
    this.camera.lookAt(0, 0, 0);
    this.orbitControls.reset();
  }

  zoomAll(): void {
    if (!this.camera || !this.scene || !this.orbitControls) return;

    const box = new THREE.Box3();
    const nodes: THREE.Object3D[] = [];
    this.scene.traverse(obj => {
      if (obj instanceof NodeBase) {
        nodes.push(obj);
      }
    });

    if (nodes.length === 0) {
      this.zoomDefault();
      return;
    }

    box.setFromObject(nodes[0]);
    for (let i = 1; i < nodes.length; i++) {
      box.expandByObject(nodes[i]);
    }

    if (box.isEmpty()) {
      this.zoomDefault();
      return;
    }

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    const fov = (this.camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
    const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 2;

    this.camera.position.set(center.x + cameraZ, center.y + cameraZ, center.z + cameraZ);
    this.camera.lookAt(center);
    this.orbitControls.target.copy(center);
    this.orbitControls.update();
  }

  resize(width: number, height: number): void {
    if (!this.renderer || !this.camera) return;

    this.viewportSize = { width, height };

    const pixelWidth = Math.ceil(width * window.devicePixelRatio);
    const pixelHeight = Math.ceil(height * window.devicePixelRatio);

    this.renderer.setSize(pixelWidth, pixelHeight, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    // Update orthographic camera to match viewport in physical pixels
    // 1 world unit = 1 physical pixel, so sprites display at true pixel size
    if (this.orthographicCamera) {
      this.orthographicCamera.left = -pixelWidth / 2;
      this.orthographicCamera.right = pixelWidth / 2;
      this.orthographicCamera.top = pixelHeight / 2;
      this.orthographicCamera.bottom = -pixelHeight / 2;
      this.orthographicCamera.updateProjectionMatrix();
    }

    // Trigger layout recalculation for root Group2D nodes
    this.sceneManager.resizeRoot(pixelWidth, pixelHeight);

    // Sync all 2D visuals after layout recalculation
    this.syncAll2DVisuals();
  }

  /**
   * Sync all Group2D and Sprite2D visuals to match their node state.
   * Called after layout recalculation to update visual positions/sizes.
   */
  private syncAll2DVisuals(): void {
    const sceneGraph = this.sceneManager.getActiveSceneGraph();
    if (!sceneGraph) return;

    // Recursively update all 2D nodes in the scene
    const updateNode2DVisuals = (nodes: NodeBase[]) => {
      for (const node of nodes) {
        if (node instanceof Group2D) {
          const visualRoot = this.group2DVisuals.get(node.nodeId);
          if (visualRoot) {
            visualRoot.position.copy(node.position);
            visualRoot.rotation.copy(node.rotation);
            visualRoot.scale.set(node.scale.x, node.scale.y, 1);
            const sizeGroup = visualRoot.userData.sizeGroup as THREE.Object3D | undefined;
            if (sizeGroup) {
              sizeGroup.scale.set(node.width, node.height, 1);

              // Update line color based on viewport container status
              const isViewportContainer = node.isViewportContainer;
              if (visualRoot.userData.isViewportContainer !== isViewportContainer) {
                visualRoot.userData.isViewportContainer = isViewportContainer;
                const line = sizeGroup.children[0] as THREE.LineSegments | undefined;
                if (line && line.userData.lineMaterial instanceof THREE.LineBasicMaterial) {
                  line.userData.lineMaterial.color.setHex(
                    isViewportContainer ? 0x4ecf4e : 0x96cbf6
                  );
                }
              }
            }
            visualRoot.visible = node.visible;
          }
        } else if (node instanceof Sprite2D) {
          const visualRoot = this.sprite2DVisuals.get(node.nodeId);
          if (visualRoot) {
            visualRoot.position.copy(node.position);
            visualRoot.rotation.copy(node.rotation);
            visualRoot.scale.set(node.scale.x, node.scale.y, 1);
            const sizeGroup = visualRoot.userData.sizeGroup as THREE.Object3D | undefined;
            if (sizeGroup) {
              sizeGroup.scale.set(node.width ?? 64, node.height ?? 64, 1);
            }
            visualRoot.visible = node.visible;
          }
        }
        updateNode2DVisuals(node.children);
      }
    };

    updateNode2DVisuals(sceneGraph.rootNodes);

    // Also refresh gizmo positions if there's a 2D selection
    if (this.selection2DOverlay) {
      this.refreshGizmoPositions();
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

    const layer2DEnabled = appState.ui.showLayer2D && Boolean(this.orthographicCamera);
    const layer3DEnabled = appState.ui.showLayer3D && Boolean(this.camera);

    if (!layer2DEnabled && !layer3DEnabled) {
      return null;
    }

    const pixelX = screenX * this.viewportSize.width;
    const pixelY = screenY * this.viewportSize.height;
    if (layer2DEnabled) {
      const hit2D = this.raycast2D(pixelX, pixelY);
      if (hit2D) {
        console.debug('[ViewportRenderer] 2D hit', hit2D.nodeId, 'at', { pixelX, pixelY });
        return hit2D;
      }
    }

    if (!layer3DEnabled || !this.camera) {
      return null;
    }

    // Create raycaster and convert screen coordinates to normalized device coordinates
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(LAYER_3D);
    console.debug('[ViewportRenderer] 3D raycast at', { pixelX, pixelY });
    const mouse = new THREE.Vector2();

    // Convert from screen coordinates (0-1) to NDC (-1 to 1)
    mouse.x = screenX * 2 - 1;
    mouse.y = -(screenY * 2 - 1);

    // Cast ray from camera through mouse position
    raycaster.setFromCamera(mouse, this.camera);

    // Get all 3D objects in the scene
    const sceneObjects: THREE.Object3D[] = [];
    this.scene.traverse(obj => {
      if (obj instanceof Node3D) {
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
          const isLocked = Boolean((current as NodeBase).properties.locked);
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

    // Only hit-test rendered 2D visuals; transparent container groups are intentionally skipped
    const candidates: THREE.Object3D[] = [...this.sprite2DVisuals.values()];

    console.debug('[ViewportRenderer] 2D raycast candidates', {
      count: candidates.length,
      nodeIds: candidates.map(c => c.userData?.nodeId).filter(Boolean),
      mouse,
    });

    const intersects = raycaster.intersectObjects(candidates, true);
    console.debug(
      '[ViewportRenderer] 2D raycast intersects',
      intersects.map(i => ({
        nodeId: i.object.userData?.nodeId,
        distance: i.distance,
        point: i.point,
      }))
    );
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
      const isLocked = Boolean((node as NodeBase).properties.locked);
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

      // Update gizmo if it exists
      const gizmo = this.selectionGizmos.get(node.nodeId);
      if (gizmo) {
        node.updateMatrixWorld(true);

        // PointLightHelper doesn't self-position in update()
        if (gizmo instanceof THREE.PointLightHelper) {
          node.getWorldPosition(gizmo.position);
        }

        // Some helpers need explicit update
        gizmo.traverse(child => {
          const updatable = child as unknown as { update?: () => void };
          if (typeof updatable.update === 'function') {
            updatable.update();
          }
        });
      }
    } else if (node instanceof Group2D) {
      const visualRoot = this.group2DVisuals.get(node.nodeId);
      if (visualRoot) {
        visualRoot.position.copy(node.position);
        visualRoot.rotation.copy(node.rotation);
        visualRoot.scale.set(node.scale.x, node.scale.y, 1);
        const sizeGroup = visualRoot.userData.sizeGroup as THREE.Object3D | undefined;
        if (sizeGroup) {
          sizeGroup.scale.set(node.width, node.height, 1);
        }
        visualRoot.visible = node.visible;
      }
    } else if (node instanceof Sprite2D) {
      const visualRoot = this.sprite2DVisuals.get(node.nodeId);
      if (visualRoot) {
        visualRoot.position.copy(node.position);
        visualRoot.rotation.copy(node.rotation);
        visualRoot.scale.set(node.scale.x, node.scale.y, 1);
        const sizeGroup = visualRoot.userData.sizeGroup as THREE.Object3D | undefined;
        if (sizeGroup) {
          sizeGroup.scale.set(node.width ?? 64, node.height ?? 64, 1);
        }
        visualRoot.visible = node.visible;
      }
    }

    if (node instanceof Node2D && this.selection2DOverlay?.nodeIds.includes(node.nodeId)) {
      this.refreshGizmoPositions();
    }
  }

  updateNodeVisibility(node: NodeBase): void {
    // Handle visibility changes for 2D nodes (Group2D and Sprite2D)
    if (node instanceof Group2D) {
      const visualRoot = this.group2DVisuals.get(node.nodeId);
      if (visualRoot) {
        visualRoot.visible = node.visible;
      }
    } else if (node instanceof Sprite2D) {
      const visualRoot = this.sprite2DVisuals.get(node.nodeId);
      if (visualRoot) {
        visualRoot.visible = node.visible;
      }
    }
  }

  updateSelection(): void {
    // Don't update selection while a 2D transform is in progress
    if (this.active2DTransform) {
      return;
    }

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

    // Clear previous selection gizmos
    for (const gizmo of this.selectionGizmos.values()) {
      if (this.scene) {
        this.scene.remove(gizmo);
      }
      gizmo.traverse(child => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
    }
    this.selectionGizmos.clear();

    // Extra safety: remove any lingering selection boxes from the scene
    // (in case of reference mismatches)
    if (this.scene) {
      const toRemove: THREE.Object3D[] = [];
      this.scene.children.forEach(child => {
        const ud = child.userData as Record<string, unknown> | undefined;
        if (ud?.isSelectionBox || ud?.isTransformGizmo || ud?.isSelectionGizmo) {
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
    this.previewCamera = null;

    // Add selection boxes for selected nodes and attach transform controls to the first one
    let firstSelectedNode: Node3D | null = null;
    const selected2DNodeIds: string[] = [];

    // Primary selection for camera preview
    const primaryNodeId = appState.selection.primaryNodeId;

    for (const nodeId of nodeIds) {
      const node = this.findNodeById(nodeId, sceneGraph.rootNodes);
      if (node && node instanceof Node3D) {
        this.selectedObjects.add(node);

        if (!firstSelectedNode) {
          firstSelectedNode = node;
        }

        if (nodeId === primaryNodeId && node instanceof Camera3D) {
          this.previewCamera = node.camera;
        }

        const box = new THREE.Box3().setFromObject(node);
        const helper = new THREE.Box3Helper(box, new THREE.Color(0x00ff00));
        helper.userData.selectionBoxId = nodeId;
        helper.userData.isSelectionBox = true;
        this.selectionBoxes.set(nodeId, helper);
        this.scene?.add(helper);

        // Create custom gizmos for specific node types
        const gizmo = this.createNodeGizmo(node);
        if (gizmo) {
          gizmo.userData.isSelectionGizmo = true;
          gizmo.layers.set(LAYER_GIZMOS);
          gizmo.traverse(child => {
            child.layers.set(LAYER_GIZMOS);
          });
          this.selectionGizmos.set(nodeId, gizmo);
          this.scene?.add(gizmo);
        }
      } else if (node && node instanceof Node2D) {
        selected2DNodeIds.push(nodeId);
      }
    }

    if (selected2DNodeIds.length > 0) {
      this.update2DSelectionOverlayForNodes(selected2DNodeIds);
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

      // Clean up previous 2D visuals
      for (const visual of this.group2DVisuals.values()) {
        if (visual.parent) {
          visual.parent.remove(visual);
        }
        this.disposeObject3D(visual);
      }
      this.group2DVisuals.clear();

      for (const visual of this.sprite2DVisuals.values()) {
        if (visual.parent) {
          visual.parent.remove(visual);
        }
        this.disposeObject3D(visual);
      }
      this.sprite2DVisuals.clear();

      // Remove all root nodes from scene (except lights and helpers)
      const objectsToRemove: THREE.Object3D[] = [];
      this.scene.children.forEach(child => {
        // Keep lights and grid
        if (!(child instanceof THREE.Light) && !(child instanceof THREE.GridHelper)) {
          objectsToRemove.push(child);
        }
      });

      objectsToRemove.forEach(obj => this.scene!.remove(obj));

      // Add scene graph root nodes and create visual representations for 2D nodes
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
  private processNodeForRendering(node: NodeBase, parent2DVisualRoot?: THREE.Object3D): void {
    if (!this.scene) return;

    // Add 3D nodes to the scene with layer 0
    if (node instanceof Node3D && !node.parent) {
      this.scene.add(node);
      node.layers.set(LAYER_3D); // 3D nodes use layer 0
    }

    let current2DVisualRoot = parent2DVisualRoot;

    if (node instanceof Group2D) {
      const visualRoot = this.createGroup2DVisual(node);
      this.group2DVisuals.set(node.nodeId, visualRoot);

      const parent = parent2DVisualRoot ?? this.scene;
      parent.add(visualRoot);
      current2DVisualRoot = visualRoot;
    } else if (node instanceof Sprite2D) {
      const visualRoot = this.createSprite2DVisual(node);
      this.sprite2DVisuals.set(node.nodeId, visualRoot);

      const parent = parent2DVisualRoot ?? this.scene;
      parent.add(visualRoot);
      current2DVisualRoot = visualRoot;
    }

    for (const child of node.children) {
      this.processNodeForRendering(child, current2DVisualRoot);
    }
  }

  /**
   * Create a rectangle outline visual representation for a Group2D node.
   */
  private createGroup2DVisual(node: Group2D): THREE.Group {
    // Visual hierarchy:
    // - root group: position/rotation/scale (transform scale)
    // - size group: width/height only (does NOT affect children)
    // - line: normalized outline
    const points: THREE.Vector3[] = [
      new THREE.Vector3(-0.5, -0.5, 0),
      new THREE.Vector3(0.5, -0.5, 0),
      new THREE.Vector3(0.5, -0.5, 0),
      new THREE.Vector3(0.5, 0.5, 0),
      new THREE.Vector3(0.5, 0.5, 0),
      new THREE.Vector3(-0.5, 0.5, 0),
      new THREE.Vector3(-0.5, 0.5, 0),
      new THREE.Vector3(-0.5, -0.5, 0),
    ];

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    geometry.computeBoundingBox();

    // Create line material with 2D node color
    // Viewport containers get a special green color to indicate viewport alignment
    const isViewportContainer = node.isViewportContainer;
    const lineColor = isViewportContainer ? 0x4ecf4e : 0x96cbf6; // Green for viewport, blue for regular

    const material = new THREE.LineBasicMaterial({
      color: lineColor,
      linewidth: 2,
    });

    const root = new THREE.Group();
    root.position.copy(node.position);
    root.rotation.copy(node.rotation);
    root.scale.set(node.scale.x, node.scale.y, 1);
    root.visible = node.visible;
    root.layers.set(LAYER_2D);

    const sizeGroup = new THREE.Group();
    sizeGroup.scale.set(node.width, node.height, 1);
    sizeGroup.layers.set(LAYER_2D);

    const line = new THREE.LineSegments(geometry, material);
    line.layers.set(LAYER_2D);
    line.userData.isGroup2DVisual = true;
    line.userData.nodeId = node.nodeId;
    line.userData.lineMaterial = material; // Store reference for color updates

    sizeGroup.add(line);
    root.add(sizeGroup);

    // Keep references for updates
    root.userData.isGroup2DVisualRoot = true;
    root.userData.nodeId = node.nodeId;
    root.userData.sizeGroup = sizeGroup;
    root.userData.isViewportContainer = isViewportContainer;

    return root;
  }

  private createNodeGizmo(node: Node3D): THREE.Object3D | null {
    if (node instanceof Camera3D) {
      return this.createCameraGizmo(node);
    } else if (node instanceof DirectionalLightNode) {
      return this.createDirectionalLightGizmo(node);
    } else if (node instanceof PointLightNode) {
      return this.createPointLightGizmo(node);
    } else if (node instanceof SpotLightNode) {
      return this.createSpotLightGizmo(node);
    }
    return null;
  }

  private createCameraGizmo(node: Camera3D): THREE.Object3D {
    const helper = new THREE.CameraHelper(node.camera);
    helper.update();
    return helper;
  }

  private createDirectionalLightGizmo(node: DirectionalLightNode): THREE.Object3D {
    const helper = new THREE.DirectionalLightHelper(node.light, 1);
    helper.update();
    return helper;
  }

  private createPointLightGizmo(node: PointLightNode): THREE.Object3D {
    const helper = new THREE.PointLightHelper(node.light, 0.5);
    node.updateMatrixWorld(true);
    node.getWorldPosition(helper.position);
    helper.update();
    return helper;
  }

  private createSpotLightGizmo(node: SpotLightNode): THREE.Object3D {
    const helper = new THREE.SpotLightHelper(node.light);
    helper.update();
    return helper;
  }

  /**
   * Create a visual representation for a Sprite2D node.
   * Renders the texture if available, or a placeholder rectangle if not.
   */
  private createSprite2DVisual(node: Sprite2D): THREE.Group {
    // Visual hierarchy:
    // - root group: position/rotation/scale (transform scale)
    // - size group: width/height only (does NOT affect children)
    // - mesh: normalized quad
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.computeBoundingBox();

    let material: THREE.Material;

    // Try to load texture if available; if it references a templ:// or res:// URL,
    // use ResourceManager to resolve it to a Blob and create an object URL for the TextureLoader.
    const textureLoader = new THREE.TextureLoader();
    const meshRef = { current: null as THREE.Mesh | null };

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

                  // Get actual image dimensions from texture
                  const image = texture.source.data as HTMLImageElement;
                  if (image && image.width && image.height) {
                    // Update node's width/height to match texture (if not already set from scene file)
                    // Only update if dimensions are still at placeholder values (undefined)
                    if (node.width === undefined || node.height === undefined) {
                      node.width = image.width;
                      node.height = image.height;
                    }

                    // Ensure the visual reflects updated dimensions
                    this.updateNodeTransform(node);
                  }
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
              console.warn(
                '[ViewportRenderer] Failed to load sprite texture',
                node.texturePath,
                err
              );
              try {
                URL.revokeObjectURL(blobUrl);
              } catch {
                // ignore
              }
            }
          );
        } catch {
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
            console.warn(
              '[ViewportRenderer] Skipping direct load for unsupported scheme:',
              texturePath
            );
          }
        }
      })();
    } else {
      // No texture path - use placeholder material (light gray)
      material = new THREE.MeshBasicMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
    }

    const mesh = new THREE.Mesh(geometry, material);
    meshRef.current = mesh; // Store reference for async texture loading callback

    mesh.layers.set(LAYER_2D);
    mesh.userData.isSprite2DVisual = true;
    mesh.userData.nodeId = node.nodeId;

    const root = new THREE.Group();
    root.position.copy(node.position);
    root.rotation.copy(node.rotation);
    root.scale.set(node.scale.x, node.scale.y, 1);
    root.visible = node.visible;
    root.layers.set(LAYER_2D);

    const sizeGroup = new THREE.Group();
    sizeGroup.scale.set(node.width ?? 64, node.height ?? 64, 1);
    sizeGroup.layers.set(LAYER_2D);
    sizeGroup.add(mesh);
    root.add(sizeGroup);

    root.userData.isSprite2DVisualRoot = true;
    root.userData.nodeId = node.nodeId;
    root.userData.sizeGroup = sizeGroup;

    return root;
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
      if (
        obj instanceof THREE.Mesh ||
        obj instanceof THREE.LineSegments ||
        obj instanceof THREE.Line
      ) {
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

  /**
   * Get bounds for a single 2D node, NOT including its descendants.
   * Uses the node's own size/transform rather than recursively computing from children.
   */
  private getNodeOnlyBounds(node: Node2D): THREE.Box3 {
    const bounds = new THREE.Box3();

    // Get world transform
    node.updateWorldMatrix(true, false);
    const worldMatrix = node.matrixWorld;

    // Determine node size
    let halfWidth = 50; // Default
    let halfHeight = 50;

    if (node instanceof Group2D) {
      halfWidth = node.width / 2;
      halfHeight = node.height / 2;
    } else if (node instanceof Sprite2D) {
      halfWidth = (node.width ?? 64) / 2;
      halfHeight = (node.height ?? 64) / 2;
    }

    // Create local corners (center-origin)
    const corners = [
      new THREE.Vector3(-halfWidth, -halfHeight, 0),
      new THREE.Vector3(halfWidth, -halfHeight, 0),
      new THREE.Vector3(halfWidth, halfHeight, 0),
      new THREE.Vector3(-halfWidth, halfHeight, 0),
    ];

    // Transform corners to world space and expand bounds
    for (const corner of corners) {
      corner.applyMatrix4(worldMatrix);
      bounds.expandByPoint(corner);
    }

    return bounds;
  }

  private update2DSelectionOverlayForNodes(nodeIds: string[]): void {
    // Don't recreate overlay during an active 2D transform - use refreshGizmoPositions instead
    if (this.active2DTransform) {
      this.refreshGizmoPositions();
      return;
    }

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

    const node2DIds: string[] = [];
    const combinedBounds = new THREE.Box3();

    for (const nodeId of nodeIds) {
      const node = sceneGraph.nodeMap.get(nodeId);
      if (!node || !(node instanceof Node2D)) {
        console.debug('[ViewportRenderer] update2DOverlay: node not Node2D', nodeId);
        continue;
      }

      const visual = this.get2DVisual(node);
      if (!visual) {
        console.debug('[ViewportRenderer] update2DOverlay: no visual for', nodeId);
        continue;
      }

      // Use node-only bounds (not including descendants)
      const nodeBounds = this.getNodeOnlyBounds(node);
      console.debug('[ViewportRenderer] update2DOverlay: nodeBounds', nodeId, nodeBounds);
      combinedBounds.union(nodeBounds);
      node2DIds.push(nodeId);
    }

    if (node2DIds.length === 0 || combinedBounds.isEmpty()) {
      console.debug('[ViewportRenderer] update2DOverlay: no valid 2D nodes or empty bounds');
      this.clear2DSelectionOverlay();
      return;
    }

    const center = combinedBounds.getCenter(new THREE.Vector3());
    console.debug('[ViewportRenderer] update2DOverlay: creating overlay', {
      node2DIds,
      center,
      combinedBounds,
    });

    this.clear2DSelectionOverlay();

    const frame = this.create2DFrame(combinedBounds);
    const handles = this.create2DHandles(combinedBounds);
    const group = new THREE.Group();
    group.add(frame, ...handles);
    group.renderOrder = 1000;
    group.layers.set(1);
    this.scene.add(group);

    this.selection2DOverlay = {
      group,
      handles,
      frame,
      nodeIds: node2DIds,
      combinedBounds,
      centerWorld: center,
      rotationHandle: handles.find(h => h.userData?.handleType === 'rotate'),
    };
  }

  private refreshGizmoPositions(): void {
    if (!this.selection2DOverlay || !this.scene) return;

    const activeSceneId = appState.scenes.activeSceneId;
    if (!activeSceneId) return;

    const sceneGraph = this.sceneManager.getSceneGraph(activeSceneId);
    if (!sceneGraph) return;

    const combinedBounds = new THREE.Box3();
    for (const nodeId of this.selection2DOverlay.nodeIds) {
      const node = sceneGraph.nodeMap.get(nodeId);
      if (!node || !(node instanceof Node2D)) continue;
      // Use node-only bounds (not including descendants)
      const nodeBounds = this.getNodeOnlyBounds(node);
      combinedBounds.union(nodeBounds);
    }

    if (combinedBounds.isEmpty()) return;

    const min = combinedBounds.min;
    const max = combinedBounds.max;
    const z = (min.z + max.z) / 2;
    const midX = (min.x + max.x) / 2;
    const midY = (min.y + max.y) / 2;
    const center = combinedBounds.getCenter(new THREE.Vector3());

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
    this.selection2DOverlay.frame.geometry.setFromPoints(framePoints);

    // Use fixed rotation handle offset from TransformTool2d for consistency
    const rotationOffset = this.transformTool2d.getRotationHandleOffset();

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

    for (const handle of this.selection2DOverlay.handles) {
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

    this.selection2DOverlay.combinedBounds.copy(combinedBounds);
    this.selection2DOverlay.centerWorld.copy(center);
  }

  private create2DFrame(bounds: THREE.Box3): THREE.LineSegments {
    return this.transformTool2d.createFrame(bounds);
  }

  private create2DHandles(bounds: THREE.Box3): THREE.Object3D[] {
    return this.transformTool2d.createHandles(bounds);
  }

  get2DHandleAt(screenX: number, screenY: number): TwoDHandle {
    if (!this.selection2DOverlay || !this.orthographicCamera) {
      return 'idle';
    }

    return this.transformTool2d.getHandleAt(
      screenX,
      screenY,
      this.selection2DOverlay,
      this.orthographicCamera,
      this.viewportSize
    );
  }

  has2DTransform(): boolean {
    return this.active2DTransform !== undefined;
  }

  /**
   * Update handle hover state for visual feedback.
   * Returns true if hover state changed (requires re-render).
   */
  updateHandleHover(screenX: number, screenY: number): boolean {
    return this.transformTool2d.updateHover(
      screenX,
      screenY,
      this.selection2DOverlay,
      this.orthographicCamera,
      this.viewportSize
    );
  }

  /**
   * Clear handle hover state (e.g., when cursor leaves viewport)
   */
  clearHandleHover(): boolean {
    return this.transformTool2d.clearHover(this.selection2DOverlay);
  }

  /**
   * Update 2D hover preview frame based on pointer position.
   * Shows a preview frame around the 2D node under the cursor.
   * Group2D nodes show in a different color.
   * Returns true if the hover state changed.
   */
  update2DHoverPreview(screenX: number, screenY: number): boolean {
    // Don't show hover preview during active transform or if selection overlay is being interacted with
    if (this.active2DTransform) {
      return this.clear2DHoverPreview();
    }

    // Don't show preview if pointer is over selection handles
    const handleType = this.get2DHandleAt(screenX, screenY);
    if (handleType !== 'idle') {
      return this.clear2DHoverPreview();
    }

    // Raycast to find 2D node under pointer
    const hit = this.raycast2D(screenX, screenY);

    // If no hit or same node, check if we should clear
    if (!hit) {
      return this.clear2DHoverPreview();
    }

    // Check if this node is already selected (don't show preview for selected nodes)
    const selectedNodeIds = appState.selection.nodeIds;
    if (selectedNodeIds.includes(hit.nodeId)) {
      return this.clear2DHoverPreview();
    }

    // If same node, no change needed
    if (this.hoverPreview2D?.nodeId === hit.nodeId) {
      return false;
    }

    // Clear previous preview
    this.clear2DHoverPreview();

    // Create new preview frame for this node
    if (hit instanceof Node2D && this.scene) {
      const bounds = this.getNodeOnlyBounds(hit);
      const isGroup2D = hit instanceof Group2D;

      // Create preview frame with different color for Group2D
      const previewColor = isGroup2D ? 0x4ecf4e : 0xffffff; // Green for Group2D, white for others
      const frame = this.create2DHoverPreviewFrame(bounds, previewColor);

      this.scene.add(frame);
      this.hoverPreview2D = { nodeId: hit.nodeId, frame };
      return true;
    }

    return false;
  }

  /**
   * Clear the 2D hover preview frame.
   * Returns true if there was a preview to clear.
   */
  clear2DHoverPreview(): boolean {
    if (!this.hoverPreview2D) {
      return false;
    }

    if (this.scene && this.hoverPreview2D.frame) {
      this.scene.remove(this.hoverPreview2D.frame);
      this.hoverPreview2D.frame.geometry.dispose();
      if (this.hoverPreview2D.frame.material instanceof THREE.Material) {
        this.hoverPreview2D.frame.material.dispose();
      }
    }

    this.hoverPreview2D = undefined;
    return true;
  }

  /**
   * Create a preview frame for hovering over 2D nodes.
   */
  private create2DHoverPreviewFrame(bounds: THREE.Box3, color: number): THREE.LineSegments {
    const min = bounds.min;
    const max = bounds.max;
    const z = (min.z + max.z) / 2 + 0.1; // Slightly above to prevent z-fighting

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
    const material = new THREE.LineBasicMaterial({
      color,
      linewidth: 1,
      depthTest: false,
      transparent: true,
      opacity: 0.6,
    });

    const frame = new THREE.LineSegments(geometry, material);
    frame.userData.isHoverPreview = true;
    frame.renderOrder = 999; // Just below selection overlay
    frame.layers.set(LAYER_2D);

    return frame;
  }

  start2DTransform(screenX: number, screenY: number, handle: TwoDHandle): void {
    if (!this.selection2DOverlay || !this.orthographicCamera) {
      return;
    }

    const activeSceneId = appState.scenes.activeSceneId;
    if (!activeSceneId) return;
    const sceneGraph = this.sceneManager.getSceneGraph(activeSceneId);
    if (!sceneGraph) return;

    const transform = this.transformTool2d.startTransform(
      screenX,
      screenY,
      handle,
      this.selection2DOverlay,
      sceneGraph,
      this.orthographicCamera,
      this.viewportSize
    );

    if (transform) {
      this.active2DTransform = transform;
      // Set active handle for visual feedback (accent color during drag)
      this.transformTool2d.setActiveHandle(handle, this.selection2DOverlay);
      this.begin2DInteraction();
      console.debug('[ViewportRenderer] start 2D transform', {
        handle,
        nodeIds: this.active2DTransform.nodeIds,
      });
    }
  }

  update2DTransform(screenX: number, screenY: number): void {
    if (!this.active2DTransform) {
      return;
    }

    const activeSceneId = appState.scenes.activeSceneId;
    if (!activeSceneId) return;
    const sceneGraph = this.sceneManager.getSceneGraph(activeSceneId);
    if (!sceneGraph) return;

    this.transformTool2d.updateTransform(
      screenX,
      screenY,
      this.active2DTransform,
      sceneGraph,
      this.orthographicCamera!,
      this.viewportSize
    );

    // Update visuals for each transformed node
    for (const nodeId of this.active2DTransform.nodeIds) {
      const node = sceneGraph.nodeMap.get(nodeId);
      if (node && node instanceof Node2D) {
        this.updateNodeTransform(node);
        // If resizing a Group2D, update layout for children only (do not recompute node itself)
        if (
          node instanceof Group2D &&
          this.active2DTransform.handle !== 'move' &&
          this.active2DTransform.handle !== 'rotate'
        ) {
          for (const child of node.children) {
            if (child instanceof Group2D) {
              child.updateLayout(node.width, node.height);
            }
          }
          this.syncAll2DVisuals();
        }
      }
    }
  }

  async complete2DTransform(): Promise<void> {
    if (!this.active2DTransform) {
      return;
    }

    const { nodeIds, startStates, handle } = this.active2DTransform;
    const sceneGraph = this.sceneManager.getActiveSceneGraph();
    if (!sceneGraph) {
      this.active2DTransform = undefined;
      this.end2DInteraction();
      return;
    }

    // If this was a move operation, recalculate offsets for Group2D nodes
    // so they maintain their new position relative to parent anchors
    if (handle === 'move') {
      for (const nodeId of nodeIds) {
        const node = sceneGraph.nodeMap.get(nodeId);
        if (node && node instanceof Group2D) {
          node.recalculateOffsets();
        }
      }
    }

    for (const nodeId of nodeIds) {
      const node = sceneGraph.nodeMap.get(nodeId);
      if (!node || !(node instanceof Node2D)) continue;

      const startState = startStates.get(nodeId);
      if (!startState) continue;

      const previousState: Transform2DState = {
        position: { x: startState.position.x, y: startState.position.y },
        rotation: MathUtils.radToDeg(startState.rotation),
        scale: { x: startState.scale.x, y: startState.scale.y },
        ...(typeof startState.width === 'number' ? { width: startState.width } : {}),
        ...(typeof startState.height === 'number' ? { height: startState.height } : {}),
      };

      const currentState: Transform2DState = {
        position: { x: node.position.x, y: node.position.y },
        rotation: MathUtils.radToDeg(node.rotation.z),
        scale: { x: node.scale.x, y: node.scale.y },
        ...(typeof (node as unknown as { width?: number }).width === 'number'
          ? { width: (node as unknown as { width?: number }).width }
          : {}),
        ...(typeof (node as unknown as { height?: number }).height === 'number'
          ? { height: (node as unknown as { height?: number }).height }
          : {}),
      };

      // Include offsets for Group2D nodes
      if (node instanceof Group2D) {
        currentState.offsetMin = { x: node.offsetMin.x, y: node.offsetMin.y };
        currentState.offsetMax = { x: node.offsetMax.x, y: node.offsetMax.y };
      }

      const op = new Transform2DCompleteOperation({
        nodeId,
        previousState,
        currentState,
      });

      await this.operationService.invokeAndPush(op);
    }

    const savedNodeIds = [...nodeIds];
    // Clear active handle visual feedback before clearing the transform
    this.transformTool2d.clearActiveHandle(this.selection2DOverlay);
    this.active2DTransform = undefined;
    this.end2DInteraction();
    this.update2DSelectionOverlayForNodes(savedNodeIds);
    console.debug('[ViewportRenderer] complete 2D transform', { nodeIds });
  }

  private toNdc(screenX: number, screenY: number): THREE.Vector2 | null {
    const { width, height } = this.viewportSize;
    if (width <= 0 || height <= 0) return null;
    return new THREE.Vector2((screenX / width) * 2 - 1, -(screenY / height) * 2 + 1);
  }

  private get2DVisual(node: Node2D): THREE.Object3D | undefined {
    if (node instanceof Group2D) {
      return this.group2DVisuals.get(node.nodeId);
    }
    if (node instanceof Sprite2D) {
      return this.sprite2DVisuals.get(node.nodeId);
    }
    return undefined;
  }

  private startRenderLoop(): void {
    const render = () => {
      if (this.isPaused) {
        this.animationId = undefined;
        return;
      }

      this.animationId = requestAnimationFrame(render);

      if (this.renderer && this.scene && this.camera) {
        // Update orbit controls
        this.orbitControls?.update();

        // Only update selection boxes and gizmos every few frames to avoid performance issues
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

            // Update gizmos
            for (const [nodeId, gizmo] of this.selectionGizmos.entries()) {
              const sceneGraph = this.sceneManager.getActiveSceneGraph();
              if (sceneGraph) {
                const node = this.findNodeById(nodeId, sceneGraph.rootNodes);
                if (node && node instanceof Node3D) {
                  node.updateMatrixWorld(true);
                  if (gizmo instanceof THREE.PointLightHelper) {
                    node.getWorldPosition(gizmo.position);
                  }
                }
              }

              gizmo.traverse(child => {
                const updatable = child as unknown as { update?: () => void };
                if (typeof updatable.update === 'function') {
                  updatable.update();
                }
              });
            }
          } catch (error) {
            console.error('[ViewportRenderer] Error updating selection:', error);
          }
        }

        // Render main scene with perspective camera (3D layer and gizmos)
        if (appState.ui.showLayer3D) {
          this.renderer.autoClear = true;
          this.renderer.render(this.scene, this.camera);
        } else {
          // Clear the canvas when 3D layer is disabled
          this.renderer.autoClear = true;
          this.renderer.clear();
        }

        // Render 2D layer with orthographic camera if enabled
        if (appState.ui.showLayer2D && this.orthographicCamera) {
          // Save and remove scene background to prevent it from overwriting 3D content
          const savedBackground = this.scene.background;
          this.scene.background = null;

          this.renderer.autoClear = false;
          this.renderer.clearDepth();
          this.renderer.render(this.scene, this.orthographicCamera);

          // Restore scene background
          this.scene.background = savedBackground;
        }

        // Render camera preview inset if a camera is selected
        if (this.previewCamera) {
          const savedBackground = this.scene.background;
          this.scene.background = null;

          // Calculate inset size (e.g., 25% of viewport)
          const insetWidth = this.viewportSize.width * 0.25;
          const insetHeight = this.viewportSize.height * 0.25;

          // Position in bottom-right corner
          const insetX = this.viewportSize.width - insetWidth - 20;
          const insetY = 20;

          // Set viewport and scissor for the inset
          const pixelRatio = this.renderer.getPixelRatio();
          this.renderer.setViewport(
            insetX * pixelRatio,
            insetY * pixelRatio,
            insetWidth * pixelRatio,
            insetHeight * pixelRatio
          );
          this.renderer.setScissor(
            insetX * pixelRatio,
            insetY * pixelRatio,
            insetWidth * pixelRatio,
            insetHeight * pixelRatio
          );
          this.renderer.setScissorTest(true);

          // Clear depth for the inset
          this.renderer.clearDepth();

          // Render only 3D layer (no gizmos)
          const savedMask = this.previewCamera.layers.mask;
          this.previewCamera.layers.set(LAYER_3D);

          this.renderer.render(this.scene, this.previewCamera);

          // Restore state
          this.previewCamera.layers.mask = savedMask;
          this.renderer.setScissorTest(false);
          this.renderer.setViewport(
            0,
            0,
            this.viewportSize.width * pixelRatio,
            this.viewportSize.height * pixelRatio
          );
          this.scene.background = savedBackground;
        }

        this.renderer.autoClear = true;
      }
    };

    this.isPaused = false;
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

    for (const visual of this.group2DVisuals.values()) {
      this.disposeObject3D(visual);
    }
    this.group2DVisuals.clear();

    for (const visual of this.sprite2DVisuals.values()) {
      this.disposeObject3D(visual);
    }
    this.sprite2DVisuals.clear();

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
