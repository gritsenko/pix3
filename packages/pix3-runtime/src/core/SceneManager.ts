import type { NodeBase } from '../nodes/NodeBase';
import { SceneLoader, type ParseSceneOptions } from './SceneLoader';
import { SceneSaver } from './SceneSaver';
import { Group2D } from '../nodes/2D/Group2D';

export interface SceneGraph {
  version: string;
  description?: string;
  rootNodes: NodeBase[];
  nodeMap: Map<string, NodeBase>;
  metadata: Record<string, unknown>;
}

export class SceneManager {
  private readonly sceneLoader: SceneLoader;
  private readonly sceneSaver: SceneSaver;

  private readonly sceneGraphs = new Map<string, SceneGraph>();
  private activeSceneId: string | null = null;

  constructor(sceneLoader: SceneLoader, sceneSaver: SceneSaver) {
    this.sceneLoader = sceneLoader;
    this.sceneSaver = sceneSaver;
  }

  async parseScene(sceneText: string, options: ParseSceneOptions = {}): Promise<SceneGraph> {
    return await this.sceneLoader.parseScene(sceneText, options);
  }

  serializeScene(graph: SceneGraph): string {
    return this.sceneSaver.serializeScene(graph);
  }

  setActiveSceneGraph(sceneId: string, graph: SceneGraph): void {
    this.sceneGraphs.set(sceneId, graph);
    this.activeSceneId = sceneId;
    // Debug logging to help trace when scenes are registered as active
    console.debug('[SceneManager] setActiveSceneGraph', {
      sceneId,
      rootCount: graph.rootNodes.length,
    });
  }

  getSceneGraph(sceneId: string): SceneGraph | null {
    const graph = this.sceneGraphs.get(sceneId) ?? null;

    return graph;
  }

  getActiveSceneGraph(): SceneGraph | null {
    if (!this.activeSceneId) {
      return null;
    }
    const graph = this.sceneGraphs.get(this.activeSceneId) ?? null;

    return graph;
  }

  /**
   * Resize the root layout containers to match viewport dimensions.
   * Triggers layout recalculation for all Group2D root nodes and their children.
   *
   * @param width Viewport width in pixels
   * @param height Viewport height in pixels
   */
  resizeRoot(width: number, height: number): void {
    const graph = this.getActiveSceneGraph();
    if (!graph) return;

    for (const node of graph.rootNodes) {
      if (node instanceof Group2D) {
        // Set the root container size directly
        node.setSize(width, height);
        // Trigger layout calculation for this root and all children
        node.updateLayout(width, height);
      }
    }
  }

  removeSceneGraph(sceneId: string): void {
    this.sceneGraphs.delete(sceneId);
    if (this.activeSceneId === sceneId) {
      this.activeSceneId = null;
    }
  }

  dispose(): void {
    this.sceneGraphs.clear();
    this.activeSceneId = null;
  }
}
