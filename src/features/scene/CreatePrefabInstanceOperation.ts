import { stringify } from 'yaml';

import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { SceneStateUpdater } from '@/core/SceneStateUpdater';
import { NodeBase, SceneManager, type SceneNodeDefinition } from '@pix3/runtime';

export interface CreatePrefabInstanceOperationParams {
  prefabPath: string;
  nodeName?: string;
  parentNodeId?: string | null;
  insertIndex?: number;
  properties?: Record<string, unknown>;
}

export class CreatePrefabInstanceOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-prefab-instance',
    title: 'Create Prefab Instance',
    description: 'Create a prefab instance node in the active scene',
    tags: ['scene', 'prefab', 'instance'],
    affectsNodeStructure: true,
  };

  private readonly params: CreatePrefabInstanceOperationParams;
  private createdRoot: NodeBase | null = null;
  private activeSceneIdAtCommit: string | null = null;
  private parentNodeIdAtCommit: string | null = null;
  private insertIndexAtCommit = -1;

  constructor(params: CreatePrefabInstanceOperationParams) {
    this.params = params;
  }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { state, container } = context;
    const activeSceneId = state.scenes.activeSceneId;
    if (!activeSceneId) {
      return { didMutate: false };
    }

    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );
    const sceneGraph = sceneManager.getSceneGraph(activeSceneId);
    if (!sceneGraph) {
      return { didMutate: false };
    }

    const prefabPath = this.normalizePrefabPath(this.params.prefabPath);
    if (!prefabPath.startsWith('res://')) {
      return { didMutate: false };
    }

    const nodeId = this.generateUniqueNodeId(sceneGraph);
    const definition: SceneNodeDefinition = {
      id: nodeId,
      instance: prefabPath,
      name: this.params.nodeName,
      properties: this.params.properties,
    };

    const tempDocument = {
      version: sceneGraph.version ?? '1.0.0',
      root: [definition],
    };

    const parsed = await sceneManager.parseScene(stringify(tempDocument), {
      filePath: state.scenes.descriptors[activeSceneId]?.filePath,
    });
    const rootNode = parsed.rootNodes[0];
    if (!rootNode) {
      return { didMutate: false };
    }

    const parentNode = this.resolveParent(sceneGraph, this.params.parentNodeId ?? null);
    const insertIndex = this.resolveInsertIndex(sceneGraph, parentNode, this.params.insertIndex);

    this.activeSceneIdAtCommit = activeSceneId;
    this.parentNodeIdAtCommit = parentNode?.nodeId ?? null;
    this.insertIndexAtCommit = insertIndex;
    this.createdRoot = rootNode;

    this.insertNode(sceneGraph, rootNode, parentNode, insertIndex);
    this.registerSubtree(sceneManager, sceneGraph, rootNode, activeSceneId);

    SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
    SceneStateUpdater.markSceneDirty(state, activeSceneId);
    SceneStateUpdater.selectNode(state, rootNode.nodeId);

    return {
      didMutate: true,
      commit: {
        label: `Create Prefab Instance (${rootNode.name})`,
        undo: () => this.undo(context),
        redo: () => this.redo(context),
      },
    };
  }

  private undo(context: OperationContext): void {
    if (!this.createdRoot || !this.activeSceneIdAtCommit) {
      return;
    }

    const { state, container } = context;
    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );
    const sceneGraph = sceneManager.getSceneGraph(this.activeSceneIdAtCommit);
    if (!sceneGraph) {
      return;
    }

    this.unregisterSubtree(sceneManager, sceneGraph, this.createdRoot, this.activeSceneIdAtCommit);
    this.removeNode(sceneGraph, this.createdRoot);

    SceneStateUpdater.updateHierarchyState(state, this.activeSceneIdAtCommit, sceneGraph);
    SceneStateUpdater.markSceneDirty(state, this.activeSceneIdAtCommit);
    SceneStateUpdater.clearSelectionIfTargeted(state, this.createdRoot.nodeId);
  }

  private redo(context: OperationContext): void {
    if (!this.createdRoot || !this.activeSceneIdAtCommit) {
      return;
    }

    const { state, container } = context;
    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );
    const sceneGraph = sceneManager.getSceneGraph(this.activeSceneIdAtCommit);
    if (!sceneGraph) {
      return;
    }

    const parentNode = this.resolveParent(sceneGraph, this.parentNodeIdAtCommit);
    this.insertNode(sceneGraph, this.createdRoot, parentNode, this.insertIndexAtCommit);
    this.registerSubtree(sceneManager, sceneGraph, this.createdRoot, this.activeSceneIdAtCommit);

    SceneStateUpdater.updateHierarchyState(state, this.activeSceneIdAtCommit, sceneGraph);
    SceneStateUpdater.markSceneDirty(state, this.activeSceneIdAtCommit);
    SceneStateUpdater.selectNode(state, this.createdRoot.nodeId);
  }

  private normalizePrefabPath(path: string): string {
    const trimmed = path.trim().replace(/\\/g, '/');
    if (trimmed.startsWith('res://')) {
      return trimmed;
    }
    return `res://${trimmed.replace(/^\/+/, '')}`;
  }

  private generateUniqueNodeId(sceneGraph: { nodeMap: Map<string, NodeBase> }): string {
    let id = `prefab-instance-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    while (sceneGraph.nodeMap.has(id)) {
      id = `prefab-instance-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
    return id;
  }

  private resolveParent(
    sceneGraph: { nodeMap: Map<string, NodeBase> },
    parentNodeId: string | null
  ): NodeBase | null {
    if (!parentNodeId) {
      return null;
    }
    const candidate = sceneGraph.nodeMap.get(parentNodeId);
    return candidate instanceof NodeBase ? candidate : null;
  }

  private resolveInsertIndex(
    sceneGraph: { rootNodes: NodeBase[] },
    parentNode: NodeBase | null,
    requestedIndex: number | undefined
  ): number {
    if (requestedIndex === undefined || requestedIndex < 0) {
      return parentNode ? parentNode.children.length : sceneGraph.rootNodes.length;
    }
    return requestedIndex;
  }

  private insertNode(
    sceneGraph: { rootNodes: NodeBase[] },
    node: NodeBase,
    parentNode: NodeBase | null,
    insertIndex: number
  ): void {
    if (parentNode) {
      parentNode.add(node);
      const boundedIndex = Math.max(0, Math.min(insertIndex, parentNode.children.length - 1));
      if (boundedIndex < parentNode.children.length - 1) {
        parentNode.children.splice(boundedIndex, 0, parentNode.children.pop() as NodeBase);
      }
      return;
    }

    if (node.parentNode) {
      node.removeFromParent();
    }
    const boundedIndex = Math.max(0, Math.min(insertIndex, sceneGraph.rootNodes.length));
    sceneGraph.rootNodes.splice(boundedIndex, 0, node);
  }

  private removeNode(sceneGraph: { rootNodes: NodeBase[] }, node: NodeBase): void {
    if (node.parentNode) {
      node.removeFromParent();
      return;
    }
    const index = sceneGraph.rootNodes.indexOf(node);
    if (index >= 0) {
      sceneGraph.rootNodes.splice(index, 1);
    }
  }

  private registerSubtree(
    sceneManager: SceneManager,
    sceneGraph: { nodeMap: Map<string, NodeBase> },
    root: NodeBase,
    sceneId: string
  ): void {
    const stack: NodeBase[] = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) {
        continue;
      }
      sceneGraph.nodeMap.set(node.nodeId, node);
      for (const group of node.groups) {
        sceneManager.addNodeToGroup(node, group, sceneId);
      }
      for (const child of node.children) {
        if (child instanceof NodeBase) {
          stack.push(child);
        }
      }
    }
  }

  private unregisterSubtree(
    sceneManager: SceneManager,
    sceneGraph: { nodeMap: Map<string, NodeBase> },
    root: NodeBase,
    sceneId: string
  ): void {
    const stack: NodeBase[] = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) {
        continue;
      }
      for (const child of node.children) {
        if (child instanceof NodeBase) {
          stack.push(child);
        }
      }
      for (const group of node.groups) {
        sceneManager.removeNodeFromGroup(node, group, sceneId);
      }
      sceneGraph.nodeMap.delete(node.nodeId);
    }
  }
}
