import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { Particles3D, SceneManager } from '@pix3/runtime';
import { SceneStateUpdater } from '@/core/SceneStateUpdater';
import { attachNode, detachNode, resolveDefault3DParent } from '@/features/scene/node-placement';

export interface CreateParticles3DOperationParams {
  nodeName?: string;
}

export class CreateParticles3DOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-particles3d',
    title: 'Create Particles3D',
    description: 'Create a 3D particle emitter node in the scene',
    tags: ['scene', '3d', 'particles', 'vfx', 'node'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateParticles3DOperationParams;

  constructor(params: CreateParticles3DOperationParams = {}) {
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

    const nodeId = `particles3d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const nodeName = this.params.nodeName || 'Particles3D';

    const node = new Particles3D({
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
