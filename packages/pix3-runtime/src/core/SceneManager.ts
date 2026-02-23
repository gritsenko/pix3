import type { NodeBase } from '../nodes/NodeBase';
import { SceneLoader, type ParseSceneOptions } from './SceneLoader';
import { SceneSaver } from './SceneSaver';
import { Group2D } from '../nodes/2D/Group2D';
import { Layout2D } from '../nodes/2D/Layout2D';

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
  private readonly groupMaps = new Map<string, Map<string, Set<NodeBase>>>();
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
    this.groupMaps.set(sceneId, this.buildGroupMap(graph));
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
   * @param skipLayout2D If true, skip Layout2D size updates (viewport resize only affects Group2D children)
   */
  resizeRoot(width: number, height: number, skipLayout2D: boolean = false): void {
    const graph = this.getActiveSceneGraph();
    if (!graph) return;

    const layout2dNode = this.findLayout2D(graph);
    if (layout2dNode && !skipLayout2D) {
      layout2dNode.updateLayout(width, height);
    }

    for (const node of graph.rootNodes) {
      if (node instanceof Group2D) {
        const layout2dWidth = layout2dNode?.width ?? width;
        const layout2dHeight = layout2dNode?.height ?? height;
        node.updateLayout(layout2dWidth, layout2dHeight);
      }
    }
  }

  private findLayout2D(graph: SceneGraph): Layout2D | null {
    for (const node of graph.rootNodes) {
      if (node instanceof Layout2D) {
        return node;
      }
    }
    return null;
  }

  removeSceneGraph(sceneId: string): void {
    this.sceneGraphs.delete(sceneId);
    this.groupMaps.delete(sceneId);
    if (this.activeSceneId === sceneId) {
      this.activeSceneId = null;
    }
  }

  addNodeToGroup(node: NodeBase, group: string, sceneId?: string): void {
    const resolvedSceneId = sceneId ?? this.activeSceneId;
    if (!resolvedSceneId) {
      return;
    }
    const groupMap = this.ensureGroupMap(resolvedSceneId);
    const nodes = groupMap.get(group) ?? new Set<NodeBase>();
    nodes.add(node);
    groupMap.set(group, nodes);
  }

  removeNodeFromGroup(node: NodeBase, group: string, sceneId?: string): void {
    const resolvedSceneId = sceneId ?? this.activeSceneId;
    if (!resolvedSceneId) {
      return;
    }
    const groupMap = this.ensureGroupMap(resolvedSceneId);
    const nodes = groupMap.get(group);
    if (!nodes) {
      return;
    }
    nodes.delete(node);
    if (nodes.size === 0) {
      groupMap.delete(group);
    }
  }

  getNodesInGroup(group: string, sceneId?: string): NodeBase[] {
    const resolvedSceneId = sceneId ?? this.activeSceneId;
    if (!resolvedSceneId) {
      return [];
    }
    const scene = this.sceneGraphs.get(resolvedSceneId);
    if (!scene) {
      return [];
    }

    const groupMap = this.ensureGroupMap(resolvedSceneId);
    const nodes = Array.from(groupMap.get(group) ?? []);
    const validNodes = nodes.filter(node => scene.nodeMap.has(node.nodeId));
    if (validNodes.length !== nodes.length) {
      this.groupMaps.set(resolvedSceneId, this.buildGroupMap(scene));
      return Array.from(this.groupMaps.get(resolvedSceneId)?.get(group) ?? []);
    }
    return validNodes;
  }

  callGroup(group: string, method: string, ...args: unknown[]): void {
    const nodes = this.getNodesInGroup(group);
    let invoked = 0;

    for (const node of nodes) {
      for (const component of node.components) {
        const candidate = (component as unknown as Record<string, unknown>)[method];
        if (typeof candidate === 'function') {
          (candidate as (...values: unknown[]) => void).apply(component, args);
          invoked += 1;
        }
      }
    }

    if (nodes.length > 0 && invoked === 0) {
      console.warn(`[SceneManager] callGroup("${group}", "${method}") found no callable methods.`);
    }
  }

  dispose(): void {
    this.sceneGraphs.clear();
    this.groupMaps.clear();
    this.activeSceneId = null;
  }

  private ensureGroupMap(sceneId: string): Map<string, Set<NodeBase>> {
    const scene = this.sceneGraphs.get(sceneId);
    if (!scene) {
      return new Map<string, Set<NodeBase>>();
    }

    let groupMap = this.groupMaps.get(sceneId);
    if (!groupMap) {
      groupMap = this.buildGroupMap(scene);
      this.groupMaps.set(sceneId, groupMap);
    }
    return groupMap;
  }

  private buildGroupMap(scene: SceneGraph): Map<string, Set<NodeBase>> {
    const groupMap = new Map<string, Set<NodeBase>>();

    for (const node of scene.nodeMap.values()) {
      for (const group of node.groups) {
        const bucket = groupMap.get(group) ?? new Set<NodeBase>();
        bucket.add(node);
        groupMap.set(group, bucket);
      }
    }

    return groupMap;
  }
}
