import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { MeshInstance } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { AssetLoader } from '@pix3/runtime';
import { attachNode, detachNode, resolveDefault3DParent } from '@/features/scene/node-placement';
import { SceneStateUpdater } from '@/core/SceneStateUpdater';

export interface AddModelOperationParams {
  modelPath: string; // res:// path to .glb/.gltf file
  modelName?: string;
}

export class AddModelOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.add-model',
    title: 'Add Model',
    description: 'Add a model instance to the scene',
    tags: ['scene', 'model', 'node'],
    affectsNodeStructure: true,
  };

  private readonly params: AddModelOperationParams;

  constructor(params: AddModelOperationParams) {
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
    const nodeId = `model-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Load the model using AssetLoader to get the actual geometry
    const assetLoader = container.getService<AssetLoader>(container.getOrCreateToken(AssetLoader));

    const modelName = this.params.modelName || this.deriveModelName(this.params.modelPath);

    let node: MeshInstance;
    try {
      const result = await assetLoader.loadAsset(this.params.modelPath, nodeId, modelName);
      node = result.node as MeshInstance;
    } catch (error) {
      console.error('[AddModelOperation] Failed to load model:', error);
      return { didMutate: false };
    }

    const targetParent = resolveDefault3DParent(sceneGraph);
    attachNode(sceneGraph, node, targetParent);

    SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
    SceneStateUpdater.markSceneDirty(state, activeSceneId);
    state.scenes.lastLoadedAt = Date.now();

    return {
      didMutate: true,
      commit: {
        label: `Add model: ${modelName}`,
        undo: () => {
          detachNode(sceneGraph, node, targetParent);
          SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
          SceneStateUpdater.markSceneDirty(state, activeSceneId);
          state.scenes.lastLoadedAt = Date.now();
        },
        redo: () => {
          attachNode(sceneGraph, node, targetParent);
          SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
          SceneStateUpdater.markSceneDirty(state, activeSceneId);
          state.scenes.lastLoadedAt = Date.now();
        },
      },
    };
  }

  private deriveModelName(modelPath: string): string {
    // Extract filename from path, e.g., "res://models/cube.glb" -> "cube"
    const match = modelPath.match(/\/([^/]+)\.(glb|gltf)$/i);
    return match ? match[1] : 'Model';
  }
}
