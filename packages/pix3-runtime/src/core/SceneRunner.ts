import {
  Clock,
  Scene,
  PerspectiveCamera,
  OrthographicCamera,
  Color,
} from 'three';
import { SceneManager } from './SceneManager';
import { RuntimeRenderer } from './RuntimeRenderer';
import { InputService } from './InputService';
import { Camera3D } from '../nodes/3D/Camera3D';
import { NodeBase } from '../nodes/NodeBase';
import { Layout2D } from '../nodes/2D/Layout2D';
import { LAYER_3D, LAYER_2D } from '../constants';

export class SceneRunner {
  private readonly sceneManager: SceneManager;
  private readonly renderer: RuntimeRenderer;
  private readonly inputService: InputService;
  private readonly clock: Clock;
  private animationFrameId: number | null = null;
  private isRunning: boolean = false;

  private scene: Scene;
  private activeCamera: Camera3D | null = null;
  private orthographicCamera: OrthographicCamera;
  private viewportSize = { width: 0, height: 0 };

  constructor(sceneManager: SceneManager, renderer: RuntimeRenderer) {
    this.sceneManager = sceneManager;
    this.renderer = renderer;
    this.inputService = new InputService();
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
      this.scene.add(node);
    }

    // Attach InputService to renderer
    this.inputService.attach(this.renderer.domElement);

    // Find the first camera to use
    this.activeCamera = this.findActiveCamera(this.runtimeGraph.rootNodes);

    if (this.activeCamera) {
      // Ensure 3D camera only sees 3D layer
      this.activeCamera.camera.layers.disableAll();
      this.activeCamera.camera.layers.enable(LAYER_3D);
    }

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
    this.tick();
  }

  private tick = (): void => {
    if (!this.isRunning || this.isPaused) return;

    const dt = this.clock.getDelta();

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
    const width = canvas.width;
    const height = canvas.height;

    // 0. Handle Resizing
    if (this.viewportSize.width !== width || this.viewportSize.height !== height) {
      this.viewportSize.width = width;
      this.viewportSize.height = height;

      // Update Layout2D nodes
      if (this.runtimeGraph) {
        for (const node of this.runtimeGraph.rootNodes) {
          if (node instanceof Layout2D) {
            node.updateLayout(width, height);
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
      const aspect = width / height;
      if (this.activeCamera.camera instanceof PerspectiveCamera) {
        if (this.activeCamera.camera.aspect !== aspect) {
          this.activeCamera.camera.aspect = aspect;
          this.activeCamera.camera.updateProjectionMatrix();
        }
      }
    }

    // 2D Camera - Update to match physical pixels 1:1
    // Note: canvas.width/height are physical pixels (drawingBufferWidth/Height)
    // We want 0,0 to be center
    if (this.orthographicCamera) {
      const halfW = width / 2;
      const halfH = height / 2;

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


    // 2. Render Passes

    // Pass 1: 3D
    if (this.activeCamera) {
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
}

