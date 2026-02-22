import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { SceneManager, Sprite3D } from '@pix3/runtime';
import { SceneStateUpdater } from '@/core/SceneStateUpdater';
import { attachNode, detachNode, resolveDefault3DParent } from '@/features/scene/node-placement';

export interface CreateSprite3DOperationParams {
  spriteName?: string;
  width?: number;
  height?: number;
  texturePath?: string | null;
  billboard?: boolean;
  billboardRoll?: number;
}

export class CreateSprite3DOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-sprite3d',
    title: 'Create Sprite3D',
    description: 'Create a 3D sprite in the scene',
    tags: ['scene', '3d', 'sprite', 'node'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateSprite3DOperationParams;

  constructor(params: CreateSprite3DOperationParams = {}) {
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

    const nodeId = `sprite3d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const spriteName = this.params.spriteName || 'Sprite3D';
    const texturePath = this.params.texturePath ?? null;

    const node = new Sprite3D({
      id: nodeId,
      name: spriteName,
      width: this.params.width,
      height: this.params.height,
      texturePath,
      billboard: this.params.billboard,
      billboardRoll: this.params.billboardRoll,
    });

    const targetParent = resolveDefault3DParent(sceneGraph);
    attachNode(sceneGraph, node, targetParent);

    SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
    SceneStateUpdater.markSceneDirty(state, activeSceneId);
    SceneStateUpdater.selectNode(state, nodeId);

    return {
      didMutate: true,
      commit: {
        label: `Create ${spriteName}`,
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
