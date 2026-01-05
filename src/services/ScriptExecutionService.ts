/**
 * ScriptExecutionService - Manages script execution lifecycle
 *
 * This service runs a requestAnimationFrame loop that calls tick() on all root nodes
 * in the active scene, managing the script lifecycle (onStart, onUpdate, onDetach).
 */

import { injectable, inject } from '@/fw/di';
import { SceneManager, type SceneGraph } from '@/core/SceneManager';
import { NodeBase } from '@/nodes/NodeBase';

interface NodeStateSnapshot {
  nodeId: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  visible: boolean;
}

@injectable()
export class ScriptExecutionService {
  @inject(SceneManager)
  private readonly sceneManager!: SceneManager;

  private animationFrameId: number | null = null;
  private lastTimestamp: number = 0;
  private isRunning: boolean = false;
  private currentSceneId: string | null = null;
  private nodeStateSnapshots: Map<string, NodeStateSnapshot[]> = new Map();

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

    const scene = this.sceneManager.getActiveSceneGraph();
    if (scene) {
      this.captureNodeState(scene);
    }

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

    const scene = this.sceneManager.getActiveSceneGraph();
    if (scene) {
      this.restoreNodeState(scene);
    }

    this.nodeStateSnapshots.delete(this.currentSceneId ?? '');

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
    // Attach unified script components
    for (const component of node.components) {
      component.node = node;
      if (component.onAttach) {
        component.onAttach(node);
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

    for (const rootNode of scene.rootNodes) {
      this.resetScriptStartedState(rootNode);
    }
  }

  /**
   * Recursively detach scripts from a node and its children
   */
  private detachScriptsFromNode(node: NodeBase): void {
    // Recursively detach from children
    for (const child of node.children) {
      if (child instanceof NodeBase) {
        this.detachScriptsFromNode(child);
      }
    }
  }

  /**
   * Recursively reset started state for all scripts in a node and its children
   */
  private resetScriptStartedState(node: NodeBase): void {
    // Recursively reset children
    for (const child of node.children) {
      if (child instanceof NodeBase) {
        this.resetScriptStartedState(child);
      }
    }
  }

  /**
   * Dispose the service
   */
  dispose(): void {
    this.stop();
  }

  /**
   * Capture the current state of all nodes in the scene
   */
  private captureNodeState(scene: SceneGraph): void {
    const snapshots: NodeStateSnapshot[] = [];

    for (const rootNode of scene.rootNodes) {
      this.captureNodeStateRecursive(rootNode, snapshots);
    }

    this.nodeStateSnapshots.set(this.currentSceneId ?? '', snapshots);
    console.debug('[ScriptExecutionService] Captured state for', snapshots.length, 'nodes');
  }

  /**
   * Recursively capture state of a node and its children
   */
  private captureNodeStateRecursive(node: NodeBase, snapshots: NodeStateSnapshot[]): void {
    const snapshot: NodeStateSnapshot = {
      nodeId: node.nodeId,
      position: { x: node.position.x, y: node.position.y, z: node.position.z },
      rotation: { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z },
      scale: { x: node.scale.x, y: node.scale.y, z: node.scale.z },
      visible: node.visible,
    };
    snapshots.push(snapshot);

    for (const child of node.children) {
      if (child instanceof NodeBase) {
        this.captureNodeStateRecursive(child, snapshots);
      }
    }
  }

  /**
   * Restore the captured state of all nodes in the scene
   */
  private restoreNodeState(scene: SceneGraph): void {
    const sceneId = this.currentSceneId ?? '';
    const snapshots = this.nodeStateSnapshots.get(sceneId);

    if (!snapshots) {
      console.warn('[ScriptExecutionService] No state snapshots found for scene:', sceneId);
      return;
    }

    const snapshotMap = new Map(snapshots.map(s => [s.nodeId, s]));
    let restoredCount = 0;

    for (const rootNode of scene.rootNodes) {
      restoredCount += this.restoreNodeStateRecursive(rootNode, snapshotMap);
    }

    console.debug('[ScriptExecutionService] Restored state for', restoredCount, 'nodes');
  }

  /**
   * Recursively restore state of a node and its children
   */
  private restoreNodeStateRecursive(
    node: NodeBase,
    snapshotMap: Map<string, NodeStateSnapshot>
  ): number {
    const snapshot = snapshotMap.get(node.nodeId);
    let restoredCount = 0;

    if (snapshot) {
      node.position.set(snapshot.position.x, snapshot.position.y, snapshot.position.z);
      node.rotation.set(snapshot.rotation.x, snapshot.rotation.y, snapshot.rotation.z);
      node.scale.set(snapshot.scale.x, snapshot.scale.y, snapshot.scale.z);
      node.visible = snapshot.visible;
      node.updateMatrix();
      restoredCount = 1;
    }

    for (const child of node.children) {
      if (child instanceof NodeBase) {
        restoredCount += this.restoreNodeStateRecursive(child, snapshotMap);
      }
    }

    return restoredCount;
  }
}
