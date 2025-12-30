/**
 * ScriptExecutionService - Manages script execution lifecycle
 *
 * This service runs a requestAnimationFrame loop that calls tick() on all root nodes
 * in the active scene, managing the script lifecycle (onStart, onUpdate, onDetach).
 */

import { injectable, inject } from '@/fw/di';
import { SceneManager } from '@/core/SceneManager';
import { NodeBase } from '@/nodes/NodeBase';

@injectable()
export class ScriptExecutionService {
  @inject(SceneManager)
  private readonly sceneManager!: SceneManager;

  private animationFrameId: number | null = null;
  private lastTimestamp: number = 0;
  private isRunning: boolean = false;
  private currentSceneId: string | null = null;

  constructor() {}

  /**
   * Start the script execution loop
   */
  start(): void {
    if (this.isRunning) {
      console.warn('[ScriptExecutionService] Already running');
      return;
    }

    this.isRunning = true;
    this.lastTimestamp = performance.now();
    this.scheduleNextFrame();

    console.log('[ScriptExecutionService] Started script execution loop');
  }

  /**
   * Stop the script execution loop and detach all scripts
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Detach all scripts from current scene
    this.detachScriptsFromScene();

    console.log('[ScriptExecutionService] Stopped script execution loop');
  }

  /**
   * Notify that the scene has changed - detach old scripts and prepare for new scene
   */
  onSceneChanged(newSceneId: string | null): void {
    if (this.currentSceneId === newSceneId) {
      return;
    }

    // Detach scripts from previous scene
    if (this.currentSceneId !== null) {
      this.detachScriptsFromScene();
    }

    this.currentSceneId = newSceneId;

    // Attach scripts to new scene
    if (newSceneId !== null) {
      this.attachScriptsToScene(newSceneId);
    }

    console.log('[ScriptExecutionService] Scene changed to:', newSceneId);
  }

  /**
   * Schedule the next animation frame
   */
  private scheduleNextFrame(): void {
    if (!this.isRunning) {
      return;
    }

    this.animationFrameId = requestAnimationFrame(timestamp => {
      this.tick(timestamp);
    });
  }

  /**
   * Main tick method called every frame
   */
  private tick(timestamp: number): void {
    if (!this.isRunning) {
      return;
    }

    // Calculate delta time in seconds
    const dt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    // Get active scene
    const scene = this.sceneManager.getActiveSceneGraph();
    if (scene) {
      // Tick all root nodes (which will recursively tick children)
      for (const rootNode of scene.rootNodes) {
        rootNode.tick(dt);
      }
    }

    // Schedule next frame
    this.scheduleNextFrame();
  }

  /**
   * Attach scripts to all nodes in the scene (call onAttach)
   */
  private attachScriptsToScene(sceneId: string): void {
    const scene = this.sceneManager.getSceneGraph(sceneId);
    if (!scene) {
      return;
    }

    for (const rootNode of scene.rootNodes) {
      this.attachScriptsToNode(rootNode);
    }
  }

  /**
   * Recursively attach scripts to a node and its children
   */
  private attachScriptsToNode(node: NodeBase): void {
    // Attach controller
    if (node.controller) {
      node.controller.node = node;
      if (node.controller.onAttach) {
        node.controller.onAttach(node);
      }
    }

    // Attach behaviors
    for (const behavior of node.behaviors) {
      behavior.node = node;
      if (behavior.onAttach) {
        behavior.onAttach(node);
      }
    }

    // Recursively attach to children
    for (const child of node.children) {
      if (child instanceof NodeBase) {
        this.attachScriptsToNode(child);
      }
    }
  }

  /**
   * Detach scripts from all nodes in the current scene (call onDetach)
   */
  private detachScriptsFromScene(): void {
    if (!this.currentSceneId) {
      return;
    }

    const scene = this.sceneManager.getSceneGraph(this.currentSceneId);
    if (!scene) {
      return;
    }

    for (const rootNode of scene.rootNodes) {
      this.detachScriptsFromNode(rootNode);
    }
  }

  /**
   * Recursively detach scripts from a node and its children
   */
  private detachScriptsFromNode(node: NodeBase): void {
    // Detach controller
    if (node.controller) {
      if (node.controller.onDetach) {
        node.controller.onDetach();
      }
      node.controller.node = null;
      node.controller._started = false;
    }

    // Detach behaviors
    for (const behavior of node.behaviors) {
      if (behavior.onDetach) {
        behavior.onDetach();
      }
      behavior.node = null;
      behavior._started = false;
    }

    // Recursively detach from children
    for (const child of node.children) {
      if (child instanceof NodeBase) {
        this.detachScriptsFromNode(child);
      }
    }
  }

  /**
   * Dispose the service
   */
  dispose(): void {
    this.stop();
  }
}
