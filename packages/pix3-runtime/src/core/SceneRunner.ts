import {
  Camera,
  Clock,
  Scene,
  PerspectiveCamera,
  OrthographicCamera,
  Color,
  Quaternion,
} from 'three';
import { SceneManager } from './SceneManager';
import { RuntimeRenderer } from './RuntimeRenderer';
import { InputService } from './InputService';
import { SceneService } from './SceneService';
import { AudioService } from './AudioService';
import { AssetLoader } from './AssetLoader';
import { Camera3D } from '../nodes/3D/Camera3D';
import { NodeBase } from '../nodes/NodeBase';
import { Layout2D, ScaleMode } from '../nodes/2D/Layout2D';
import { Sprite3D } from '../nodes/3D/Sprite3D';
import { AnimatedSprite3D } from '../nodes/3D/AnimatedSprite3D';
import { Particles3D } from '../nodes/3D/Particles3D';
import { AudioPlayer } from '../nodes/AudioPlayer';
import { LAYER_3D, LAYER_2D } from '../constants';

export class SceneRunner {
  private readonly sceneManager: SceneManager;
  private readonly renderer: RuntimeRenderer;
  private readonly inputService: InputService;
  private readonly sceneService: SceneService;
  private readonly audioService: AudioService;
  private readonly clock: Clock;
  private animationFrameId: number | null = null;
  private isRunning: boolean = false;

  private scene: Scene;
  private activeCamera: Camera3D | null = null;
  private orthographicCamera: OrthographicCamera;
  private viewportSize = { width: 0, height: 0 };
  /** Adaptive logical camera dimensions computed from viewportBaseSize + viewport aspect. */
  private logicalCameraSize = { width: 1, height: 1 };

  constructor(
    sceneManager: SceneManager,
    renderer: RuntimeRenderer,
    audioService: AudioService,
    assetLoader: AssetLoader
  ) {
    this.sceneManager = sceneManager;
    this.renderer = renderer;
    this.inputService = new InputService();
    this.sceneService = new SceneService();
    this.audioService = audioService;
    this.clock = new Clock();
    this.scene = new Scene();
    // Default background
    this.scene.background = new Color('#202020');

    // Setup 2D Camera
    // Initial size 1x1, will be resized immediately
    this.orthographicCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.orthographicCamera.position.z = 100;
    this.orthographicCamera.layers.disableAll();
    this.orthographicCamera.layers.enable(LAYER_2D);

    // Wire SceneService delegate
    const runner = this;
    this.sceneService.setDelegate({
      getActiveCameraNode(): Camera3D | null {
        return runner.activeCamera;
      },
      getUICamera(): Camera | null {
        return runner.orthographicCamera;
      },
      setActiveCameraNode(camera: Camera3D | null): void {
        runner.activeCamera = camera;
      },
      findNodeById(id: string): NodeBase | null {
        return runner.findNodeById(id);
      },
      getAudioService(): AudioService {
        return audioService;
      },
      getAssetLoader(): AssetLoader {
        return assetLoader;
      },
    });
  }

  /**
   * Start running a specific scene.
   * Clears the current scene, loads the new one, and starts the loop.
   */
  private runtimeGraph: import('./SceneManager').SceneGraph | null = null;

  async startScene(sceneId: string): Promise<void> {
    const sourceGraph = this.sceneManager.getSceneGraph(sceneId);
    if (!sourceGraph) {
      console.warn(`[SceneRunner] Scene "${sceneId}" not found.`);
      return;
    }

    this.stop();

    // Ensure fade overlay is positioned over the correct canvas
    this.sceneService.attachCanvas(this.renderer.domElement);

    // Setup scene
    this.scene.clear();
    this.activeCamera = null;

    // CLONE: Serialize and parse to create an isolated runtime graph
    try {
      const serialized = this.sceneManager.serializeScene(sourceGraph);
      this.runtimeGraph = await this.sceneManager.parseScene(serialized);
    } catch (err) {
      console.error('[SceneRunner] Failed to clone scene for runtime:', err);
      return;
    }

    // Add root nodes to the THREE.Scene
    for (const node of this.runtimeGraph.rootNodes) {
      // Inject InputService
      node.input = this.inputService;
      // Inject SceneService
      node.scene = this.sceneService;
      this.scene.add(node);
    }

    this.applyInitialVisibility(this.runtimeGraph.rootNodes);

    // Attach InputService to renderer
    this.inputService.attach(this.renderer.domElement);

    // Find the first camera to use
    this.activeCamera = this.findActiveCamera(this.runtimeGraph.rootNodes);

    if (this.activeCamera) {
      // Ensure 3D camera only sees 3D layer
      this.activeCamera.camera.layers.disableAll();
      this.activeCamera.camera.layers.enable(LAYER_3D);
    }

    // Reset viewport tracking so render() recomputes logicalCameraSize with
    // the new scene's Layout2D authored dimensions on the first tick.
    this.viewportSize = { width: 0, height: 0 };
    this.logicalCameraSize = { width: 1, height: 1 };

    // Initial tick to update transforms before render
    this.updateNodes(0);

    this.isRunning = true;
    this.clock.start();
    this.tick();
  }

  private isPaused: boolean = false;

  stop(): void {
    this.isRunning = false;
    this.clock.stop();
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Clear the runtime scene to release resources
    if (this.runtimeGraph) {
      for (const rootNode of this.runtimeGraph.rootNodes) {
        this.stopAudioPlayers(rootNode);
      }

      this.audioService.stopAll();

      // Clear delegate to prevent any pending async calls from restarting audio/loading
      this.sceneService.setDelegate(null);

      // Remove nodes from the THREE scene (optional, as scene.clear() might be called next start)
      // But good for cleanup
      this.scene.clear();
      this.runtimeGraph = null;
    }

    this.inputService.detach();
  }

  pause(): void {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  resume(): void {
    if (!this.isRunning || !this.isPaused) return;
    this.isPaused = false;
    // Consume the time elapsed during pause so the next tick gets a fresh delta.
    this.clock.getDelta();
    this.tick();
  }

  private tick = (): void => {
    if (!this.isRunning || this.isPaused) return;

    const dt = this.clock.getDelta();

    this.inputService.beginFrame();
    this.updateNodes(dt);
    this.render();

    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  private updateNodes(dt: number): void {
    const graph = this.runtimeGraph;
    if (graph) {
      for (const node of graph.rootNodes) {
        node.tick(dt);
      }
    }
  }

  private render(): void {
    const canvas = this.renderer.domElement;
    // Use CSS (logical) pixel dimensions for display-independent scaling so that
    // the camera coordinate space is consistent regardless of device pixel ratio.
    const cssWidth = canvas.clientWidth > 0 ? canvas.clientWidth : canvas.width;
    const cssHeight = canvas.clientHeight > 0 ? canvas.clientHeight : canvas.height;

    // 0. Handle Resizing
    // Track whether viewport changed so we can notify scripts AFTER cameras are updated.
    const viewportChanged =
      this.viewportSize.width !== cssWidth || this.viewportSize.height !== cssHeight;

    if (viewportChanged) {
      this.viewportSize.width = cssWidth;
      this.viewportSize.height = cssHeight;

      // Compute adaptive logical camera dimensions (Expand / Match-Min mode).
      // The Layout2D's authored size is the base resolution that must always
      // fit entirely within the camera view.
      let cameraWidth = cssWidth;
      let cameraHeight = cssHeight;

      if (this.runtimeGraph) {
        const layout2d = this.runtimeGraph.rootNodes.find(
          (n): n is Layout2D => n instanceof Layout2D
        );
        if (layout2d && layout2d.width > 0 && layout2d.height > 0) {
          const baseW = layout2d.width;
          const baseH = layout2d.height;
          const baseAspect = baseW / baseH;
          const viewportAspect = cssWidth / cssHeight;
          if (viewportAspect >= baseAspect) {
            cameraHeight = baseH;
            cameraWidth = cameraHeight * viewportAspect;
          } else {
            cameraWidth = baseW;
            cameraHeight = cameraWidth / viewportAspect;
          }
        }
      }

      this.logicalCameraSize = { width: cameraWidth, height: cameraHeight };

      // Update Layout2D nodes with the logical camera dimensions so that
      // anchored children track the visible camera edges.
      if (this.runtimeGraph) {
        for (const node of this.runtimeGraph.rootNodes) {
          if (node instanceof Layout2D) {
            this.applyLayout2DViewportScaling(node, cameraWidth, cameraHeight);
          }
        }
      }
    }

    // 1. Update Cameras

    // 3D Camera
    if (!this.activeCamera) {
      const graph = this.runtimeGraph;
      if (graph) {
        this.activeCamera = this.findActiveCamera(graph.rootNodes);
        if (this.activeCamera) {
          // Ensure 3D camera only sees 3D layer
          this.activeCamera.camera.layers.disableAll();
          this.activeCamera.camera.layers.enable(LAYER_3D);
        } else {
          // console.warn('[SceneRunner] No active camera found in scene.');
        }
      }
    }

    if (this.activeCamera) {
      // Use CSS pixel aspect ratio for correct visual perspective.
      const aspect = cssWidth / cssHeight;
      if (this.activeCamera.camera instanceof PerspectiveCamera) {
        if (this.activeCamera.camera.aspect !== aspect) {
          this.activeCamera.camera.aspect = aspect;
          this.activeCamera.camera.updateProjectionMatrix();
        }
      }
    }

    // 2D Camera - use the adaptive logical camera dimensions so the ortho camera
    // coordinate space matches the authored design resolution with expand-mode scaling.
    if (this.orthographicCamera) {
      const halfW = this.logicalCameraSize.width / 2;
      const halfH = this.logicalCameraSize.height / 2;

      if (
        this.orthographicCamera.left !== -halfW ||
        this.orthographicCamera.right !== halfW ||
        this.orthographicCamera.top !== halfH ||
        this.orthographicCamera.bottom !== -halfH
      ) {
        this.orthographicCamera.left = -halfW;
        this.orthographicCamera.right = halfW;
        this.orthographicCamera.top = halfH;
        this.orthographicCamera.bottom = -halfH;
        this.orthographicCamera.updateProjectionMatrix();
      }
    }

    // Notify scripts of viewport change AFTER camera matrices are updated so that
    // pin/projection-based scripts (e.g. PinToNodeBehavior) project with correct matrices.
    if (viewportChanged) {
      this.sceneService.setViewportSize(cssWidth, cssHeight);
    }

    // 2. Render Passes

    // Pass 1: 3D
    if (this.activeCamera) {
      this.updateBillboardSprites(this.runtimeGraph?.rootNodes ?? [], this.activeCamera.camera);
      this.renderer.setAutoClear(true);
      this.renderer.render(this.scene, this.activeCamera.camera);
    } else {
      this.renderer.setAutoClear(true);
      this.renderer.clear();
    }

    // Pass 2: 2D Overlay
    // We need to clear depth but keep color
    this.renderer.setAutoClear(false);
    this.renderer.clearDepth();

    // Save background to prevent clearing it
    const savedBg = this.scene.background;
    this.scene.background = null;

    this.renderer.render(this.scene, this.orthographicCamera);

    // Restore
    this.scene.background = savedBg;
  }

  private findActiveCamera(nodes: NodeBase[]): Camera3D | null {
    for (const node of nodes) {
      if (node instanceof Camera3D && node.visible) {
        // Simple check: first visible camera is active
        return node;
      }
      if (node.children && node.children.length > 0) {
        // Recurse - need to cast children to NodeBase[] effectively
        const childNodes = node.children.filter((c): c is NodeBase => c instanceof NodeBase);
        const cam = this.findActiveCamera(childNodes);
        if (cam) return cam;
      }
    }
    return null;
  }

  private findNodeById(id: string): NodeBase | null {
    if (!this.runtimeGraph) return null;
    for (const node of this.runtimeGraph.rootNodes) {
      const found = node.findById(id);
      if (found) return found;
    }
    return null;
  }

  private updateBillboardSprites(nodes: NodeBase[], camera: Camera): void {
    const cameraQuaternion = camera.getWorldQuaternion(new Quaternion());
    for (const node of nodes) {
      if (
        node instanceof Sprite3D ||
        node instanceof AnimatedSprite3D ||
        node instanceof Particles3D
      ) {
        node.applyBillboard(cameraQuaternion);
      }
      if (node.children.length > 0) {
        this.updateBillboardSprites(node.children, camera);
      }
    }
  }

  private applyInitialVisibility(nodes: NodeBase[]): void {
    for (const node of nodes) {
      const initialVisibility = this.readInitialVisibility(node);
      if (initialVisibility !== undefined) {
        node.visible = initialVisibility;
        node.properties.visible = initialVisibility;
      }

      const childNodes = node.children.filter(
        (child): child is NodeBase => child instanceof NodeBase
      );
      if (childNodes.length > 0) {
        this.applyInitialVisibility(childNodes);
      }
    }
  }

  private readInitialVisibility(node: NodeBase): boolean | undefined {
    const properties = node.properties as Record<string, unknown> | undefined;
    const direct = properties?.initiallyVisible;
    const legacySnakeCase = properties?.initially_visible;
    const userDataProps = (node.userData.properties as Record<string, unknown> | undefined)
      ?.initiallyVisible;

    return (
      this.toBooleanLike(direct) ??
      this.toBooleanLike(legacySnakeCase) ??
      this.toBooleanLike(userDataProps)
    );
  }

  private toBooleanLike(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
      return undefined;
    }

    return undefined;
  }

  private applyLayout2DViewportScaling(
    layout: Layout2D,
    viewportWidth: number,
    viewportHeight: number
  ): void {
    const usesViewportLayoutBounds = layout.scaleMode === ScaleMode.Scale;
    if (usesViewportLayoutBounds) {
      layout.recalculateChildLayouts(viewportWidth, viewportHeight);
    } else {
      layout.updateLayout();
    }

    const transform = layout.calculateScaleTransform(viewportWidth, viewportHeight);
    const authoredTransform = this.getLayout2DAuthoredTransform(layout);

    layout.scale.set(
      authoredTransform.scaleX * transform.scaleX,
      authoredTransform.scaleY * transform.scaleY,
      layout.scale.z
    );
    layout.position.set(
      authoredTransform.positionX + transform.offsetX,
      authoredTransform.positionY + transform.offsetY,
      layout.position.z
    );
  }

  private getLayout2DAuthoredTransform(layout: Layout2D): {
    positionX: number;
    positionY: number;
    scaleX: number;
    scaleY: number;
  } {
    const transform = this.asRecord(layout.properties.transform);
    const position = this.readVector2(transform?.position, 0, 0);
    const scale = this.readVector2(transform?.scale, 1, 1);

    return {
      positionX: position.x,
      positionY: position.y,
      scaleX: scale.x,
      scaleY: scale.y,
    };
  }

  private readVector2(
    value: unknown,
    fallbackX: number,
    fallbackY: number
  ): { x: number; y: number } {
    if (Array.isArray(value)) {
      const x = typeof value[0] === 'number' && Number.isFinite(value[0]) ? value[0] : fallbackX;
      const y = typeof value[1] === 'number' && Number.isFinite(value[1]) ? value[1] : fallbackY;
      return { x, y };
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const x = typeof record.x === 'number' && Number.isFinite(record.x) ? record.x : fallbackX;
      const y = typeof record.y === 'number' && Number.isFinite(record.y) ? record.y : fallbackY;
      return { x, y };
    }

    return { x: fallbackX, y: fallbackY };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private stopAudioPlayers(node: NodeBase): void {
    if (node instanceof AudioPlayer) {
      node.stop();
    }

    for (const child of node.children) {
      this.stopAudioPlayers(child);
    }
  }
}
