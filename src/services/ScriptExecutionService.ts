/**
 * ScriptExecutionService - Manages script lifecycle and execution
 *
 * Responsibilities:
 * - Run requestAnimationFrame loop to tick all scripts
 * - Manage script lifecycle (onStart on first tick, onDetach on scene unload)
 * - Track which scripts have been started
 * - Provide start/stop control for the execution loop
 *
 * This service is the execution engine for the script system. It does NOT
 * mutate appState directly - it only calls lifecycle methods on scripts
 * which may then perform mutations via Operations.
 */

import { injectable, inject } from '@/fw/di';
import { SceneManager } from '@/core/SceneManager';
import type { NodeBase } from '@/nodes/NodeBase';
import type { Behavior, ScriptController } from '@/core/ScriptComponent';

@injectable()
export class ScriptExecutionService {
  @inject(SceneManager)
  private readonly sceneManager!: SceneManager;

  private animationFrameId: number | null = null;
  private lastFrameTime: number = 0;
  private isRunning: boolean = false;

  // Track which scripts have been started to call onStart only once
  private startedScripts = new WeakSet<Behavior | ScriptController>();

  constructor() {}

  /**
   * Start the script execution loop
   */
  public start(): void {
    if (this.isRunning) {
      console.warn('[ScriptExecutionService] Already running');
      return;
    }

    console.log('[ScriptExecutionService] Starting execution loop');
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.tick(this.lastFrameTime);
  }

  /**
   * Stop the script execution loop
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('[ScriptExecutionService] Stopping execution loop');
    this.isRunning = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Internal tick method - called every frame by RAF
   */
  private tick = (currentTime: number): void => {
    if (!this.isRunning) {
      return;
    }

    // Calculate delta time in seconds
    const dt = (currentTime - this.lastFrameTime) / 1000;
    this.lastFrameTime = currentTime;

    // Get the active scene
    const activeScene = this.sceneManager.getActiveSceneGraph();
    if (activeScene) {
      // Tick all root nodes (which will recursively tick children)
      for (const rootNode of activeScene.rootNodes) {
        this.tickNode(rootNode, dt);
      }
    }

    // Schedule next frame
    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  /**
   * Tick a single node and handle script lifecycle
   */
  private tickNode(node: NodeBase, dt: number): void {
    // Process controller
    if (node.controller) {
      this.tickScript(node.controller, dt);
    }

    // Process behaviors
    for (const behavior of node.behaviors) {
      this.tickScript(behavior, dt);
    }

    // Recursively process children
    for (const child of node.children) {
      if (child instanceof NodeBase) {
        this.tickNode(child, dt);
      }
    }
  }

  /**
   * Tick a single script component (behavior or controller)
   * Handles onStart lifecycle on first tick
   */
  private tickScript(script: Behavior | ScriptController, dt: number): void {
    if (!script.enabled) {
      return;
    }

    // Call onStart if this is the first tick for this script
    if (!this.startedScripts.has(script)) {
      this.startedScripts.add(script);
      if (script.onStart) {
        try {
          script.onStart();
        } catch (error) {
          console.error(
            `[ScriptExecutionService] Error in onStart for script "${script.id}":`,
            error
          );
        }
      }
    }

    // Call onUpdate
    if (script.onUpdate) {
      try {
        script.onUpdate(dt);
      } catch (error) {
        console.error(
          `[ScriptExecutionService] Error in onUpdate for script "${script.id}":`,
          error
        );
      }
    }
  }

  /**
   * Detach all scripts from nodes in a scene (called when scene is unloaded)
   */
  public detachSceneScripts(rootNodes: NodeBase[]): void {
    console.log('[ScriptExecutionService] Detaching scripts from scene');

    for (const rootNode of rootNodes) {
      this.detachNodeScripts(rootNode);
    }
  }

  /**
   * Recursively detach scripts from a node and its children
   */
  private detachNodeScripts(node: NodeBase): void {
    // Detach controller
    if (node.controller) {
      this.detachScript(node.controller);
      node.controller = null;
    }

    // Detach behaviors
    for (const behavior of node.behaviors) {
      this.detachScript(behavior);
    }
    node.behaviors = [];

    // Recursively detach from children
    for (const child of node.children) {
      if (child instanceof NodeBase) {
        this.detachNodeScripts(child);
      }
    }
  }

  /**
   * Detach a single script component
   */
  private detachScript(script: Behavior | ScriptController): void {
    // Remove from started tracking
    this.startedScripts.delete(script);

    // Call onDetach
    if (script.onDetach) {
      try {
        script.onDetach();
      } catch (error) {
        console.error(
          `[ScriptExecutionService] Error in onDetach for script "${script.id}":`,
          error
        );
      }
    }
  }

  /**
   * Attach a script to a node (calls onAttach)
   */
  public attachScript(script: Behavior | ScriptController, node: NodeBase): void {
    script.node = node;

    if (script.onAttach) {
      try {
        script.onAttach(node);
      } catch (error) {
        console.error(
          `[ScriptExecutionService] Error in onAttach for script "${script.id}":`,
          error
        );
      }
    }
  }

  /**
   * Check if the service is currently running
   */
  public get running(): boolean {
    return this.isRunning;
  }

  /**
   * Dispose of the service (cleanup)
   */
  public dispose(): void {
    this.stop();
    this.startedScripts = new WeakSet();
  }
}
