import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { Node3D } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { attachNode, detachNode, resolveDefault3DParent } from '@/features/scene/node-placement';
import { SceneStateUpdater } from '@/core/SceneStateUpdater';

export interface CreateNode3DOperationParams {
  nodeName?: string;
}

export class CreateNode3DOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-node3d',
    title: 'Create Node3D',
    description: 'Create an empty 3D node for grouping and organization',
    tags: ['scene', '3d', 'node', 'empty', 'container', 'group'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateNode3DOperationParams;

  constructor(params: CreateNode3DOperationParams = {}) {
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

    // Generate a unique node ID
    const nodeId = `node3d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Create the Node3D node
    const nodeName = this.params.nodeName || 'Node3D';

    const node = new Node3D({
      id: nodeId,
      name: nodeName,
    });

    const targetParent = resolveDefault3DParent(sceneGraph);
    attachNode(sceneGraph, node, targetParent);

    SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
    SceneStateUpdater.markSceneDirty(state, activeSceneId);
    SceneStateUpdater.selectNode(state, nodeId);

    return {
      didMutate: true,
      commit: {
        label: `Create ${nodeName}`,
        undo: () => {
          detachNode(sceneGraph, node, targetParent);
          SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
          SceneStateUpdater.markSceneDirty(state, activeSceneId);
          SceneStateUpdater.clearSelectionIfTargeted(state, nodeId);
        },
        redo: () => {
          attachNode(sceneGraph, node, targetParent);
          SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
          SceneStateUpdater.markSceneDirty(state, activeSceneId);
          SceneStateUpdater.selectNode(state, nodeId);
        },
      },
    };
  }
}
