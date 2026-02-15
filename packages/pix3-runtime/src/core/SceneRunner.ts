import {
  Clock,
  Scene,
  PerspectiveCamera,
  OrthographicCamera,
  Color,
} from 'three';
import { SceneManager } from './SceneManager';
import { RuntimeRenderer } from './RuntimeRenderer';
import { Camera3D } from '../nodes/3D/Camera3D';
import { NodeBase } from '../nodes/NodeBase';

export class SceneRunner {
  private readonly sceneManager: SceneManager;
  private readonly renderer: RuntimeRenderer;
  private readonly clock: Clock;
  private animationFrameId: number | null = null;
  private isRunning: boolean = false;

  private scene: Scene;
  private activeCamera: Camera3D | null = null;

  constructor(sceneManager: SceneManager, renderer: RuntimeRenderer) {
    this.sceneManager = sceneManager;
    this.renderer = renderer;
    this.clock = new Clock();
    this.scene = new Scene();
    // Default background
    this.scene.background = new Color('#202020');
  }

  /**
   * Start running a specific scene.
   * Clears the current scene, loads the new one, and starts the loop.
   */
  private runtimeGraph: import('./SceneManager').SceneGraph | null = null;

  /**
   * Start running a specific scene.
   * Clears the current scene, loads the new one, and starts the loop.
   */
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
      this.scene.add(node);
    }

    // Find the first camera to use
    this.activeCamera = this.findActiveCamera(this.runtimeGraph.rootNodes);

    // Initial tick to update transforms before render
    this.updateNodes(0);

    this.isRunning = true;
    this.clock.start();
    this.tick();
  }

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
  }

  private tick = (): void => {
    if (!this.isRunning) return;

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
    if (!this.activeCamera) {
      // Try to find a camera if we lost it (e.g. strict strict mode)
      const graph = this.runtimeGraph;
      if (graph) {
        this.activeCamera = this.findActiveCamera(graph.rootNodes);
        if (!this.activeCamera) {
          console.warn('[SceneRunner] No active camera found in scene.');
        }
      }
    }

    if (this.activeCamera) {
      // Update camera aspect ratio based on renderer size
      this.updateCameraAspect(this.activeCamera);

      this.renderer.render(this.scene, this.activeCamera.camera);
    }
  }

  private findActiveCamera(nodes: NodeBase[]): Camera3D | null {
    for (const node of nodes) {
      if (node instanceof Camera3D && node.visible) {
        // Simple check: first visible camera is active
        return node;
      }
      if (node.children && node.children.length > 0) {
        // Recurse - need to cast children to NodeBase[] effectively
        // node.children contains Object3D, filter for NodeBase
        const childNodes = node.children.filter((c): c is NodeBase => c instanceof NodeBase);
        const cam = this.findActiveCamera(childNodes);
        if (cam) return cam;
      }
    }
    return null;
  }

  private updateCameraAspect(cameraNode: Camera3D): void {
    const canvas = this.renderer.domElement;
    const aspect = canvas.width / canvas.height;

    if (cameraNode.camera instanceof PerspectiveCamera) {
      if (cameraNode.camera.aspect !== aspect) {
        cameraNode.camera.aspect = aspect;
        cameraNode.camera.updateProjectionMatrix();
      }
    } else if (cameraNode.camera instanceof OrthographicCamera) {
      // TODO: Handle orthographic resizing if needed
    }
  }
}

