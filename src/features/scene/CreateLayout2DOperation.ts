import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { Layout2D } from '@pix3/runtime';
import { NodeBase } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { SceneStateUpdater } from '@/core/SceneStateUpdater';

export interface CreateLayout2DOperationParams {
  width?: number;
  height?: number;
}

export class CreateLayout2DOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-layout2d',
    title: 'Create Layout2D',
    description: 'Create a new Layout2D root node',
    tags: ['scene', 'layout2d', 'viewport', 'node', 'container'],
  };

  private readonly params: CreateLayout2DOperationParams;

  constructor(params: CreateLayout2DOperationParams = {}) {
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

    // Check if Layout2D already exists
    for (const node of sceneGraph.rootNodes) {
      if (node instanceof Layout2D) {
        console.warn('[CreateLayout2DOperation] Layout2D already exists');
        return { didMutate: false };
      }
    }

    // Generate a unique node ID
    const nodeId = `layout2d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const width = this.params.width ?? 1920;
    const height = this.params.height ?? 1080;

    const node = new Layout2D({
      id: nodeId,
      name: '2D Layout',
      width,
      height,
    });

    // Add to scene graph
    sceneGraph.rootNodes.push(node);
    sceneGraph.nodeMap.set(nodeId, node);

    SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
    SceneStateUpdater.markSceneDirty(state, activeSceneId);

    // Move existing Group2D root nodes as children of Layout2D
    const nodesToMove: NodeBase[] = [];
    for (let i = 0; i < sceneGraph.rootNodes.length - 1; i++) {
      const n = sceneGraph.rootNodes[i];
      if (n && n.type === 'Group2D') {
        nodesToMove.push(n);
      }
    }

    for (const childNode of nodesToMove) {
      sceneGraph.rootNodes = sceneGraph.rootNodes.filter(n => n !== childNode);
      node.adoptChild(childNode);
    }

    SceneStateUpdater.selectNode(state, nodeId);

    return {
      didMutate: true,
      commit: {
        label: 'Create Layout2D',
        undo: () => {
          sceneGraph.rootNodes = sceneGraph.rootNodes.filter(n => n !== node);
          sceneGraph.nodeMap.delete(nodeId);
          SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
          SceneStateUpdater.markSceneDirty(state, activeSceneId);
          SceneStateUpdater.clearSelectionIfTargeted(state, nodeId);
        },
        redo: () => {
          sceneGraph.rootNodes.push(node);
          sceneGraph.nodeMap.set(nodeId, node);
          SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
          SceneStateUpdater.markSceneDirty(state, activeSceneId);
          SceneStateUpdater.selectNode(state, nodeId);
        },
      },
    };
  }
}
