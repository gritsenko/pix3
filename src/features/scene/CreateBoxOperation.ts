import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { GeometryMesh } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { attachNode, detachNode, resolveDefault3DParent } from '@/features/scene/node-placement';
import { SceneStateUpdater } from '@/core/SceneStateUpdater';

export interface CreateBoxOperationParams {
  boxName?: string;
  size?: [number, number, number];
  color?: string;
}

export class CreateBoxOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-box',
    title: 'Create Box',
    description: 'Create a box geometry mesh in the scene',
    tags: ['scene', 'geometry', 'box', 'node'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateBoxOperationParams;

  constructor(params: CreateBoxOperationParams = {}) {
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
    const nodeId = `box-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Create the box node
    const boxName = this.params.boxName || 'Box';
    const size = this.params.size ?? [1, 1, 1];
    const color = this.params.color ?? '#4e8df5';

    const node = new GeometryMesh({
      id: nodeId,
      name: boxName,
      geometry: 'box',
      size,
      material: { color },
    });

    const parentNode = resolveDefault3DParent(sceneGraph);

    attachNode(sceneGraph, node, parentNode);
    SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
    SceneStateUpdater.markSceneDirty(state, activeSceneId);
    SceneStateUpdater.selectNode(state, nodeId);

    return {
      didMutate: true,
      commit: {
        label: `Create ${boxName}`,
        undo: () => {
          detachNode(sceneGraph, node, parentNode);
          SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
          SceneStateUpdater.markSceneDirty(state, activeSceneId);
          SceneStateUpdater.clearSelectionIfTargeted(state, nodeId);
        },
        redo: () => {
          attachNode(sceneGraph, node, parentNode);
          SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
          SceneStateUpdater.markSceneDirty(state, activeSceneId);
          SceneStateUpdater.selectNode(state, nodeId);
        },
      },
    };
  }
}
