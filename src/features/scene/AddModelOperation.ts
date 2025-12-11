import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { MeshInstance } from '@/nodes/3D/MeshInstance';
import { SceneManager } from '@/core/SceneManager';
import { AssetLoader } from '@/core/AssetLoader';
import { getAppStateSnapshot } from '@/state';
import { ref } from 'valtio/vanilla';

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

    // Add to the scene graph
    sceneGraph.rootNodes.push(node);
    sceneGraph.nodeMap.set(nodeId, node);

    // Update the state hierarchy - REPLACE the entire object to trigger reactivity
    const hierarchy = state.scenes.hierarchies[activeSceneId];
    if (hierarchy) {
      // Create a new hierarchy state object to trigger Valtio subscribers
      state.scenes.hierarchies[activeSceneId] = {
        version: hierarchy.version,
        description: hierarchy.description,
        rootNodes: ref([...sceneGraph.rootNodes]), // Create new array reference
        metadata: hierarchy.metadata,
      };
    }

    // Mark scene as dirty
    const descriptor = state.scenes.descriptors[activeSceneId];
    if (descriptor) {
      descriptor.isDirty = true;
      state.scenes.lastLoadedAt = Date.now();
    }

    // Create undo/redo closures
    const beforeSnapshot = context.snapshot;
    const afterSnapshot = getAppStateSnapshot();

    return {
      didMutate: true,
      commit: {
        label: `Add model: ${modelName}`,
        beforeSnapshot,
        afterSnapshot,
        undo: () => {
          // Remove node from scene graph
          const idx = sceneGraph.rootNodes.indexOf(node);
          if (idx >= 0) {
            sceneGraph.rootNodes.splice(idx, 1);
          }
          sceneGraph.nodeMap.delete(nodeId);

          // Update state hierarchy - replace to trigger reactivity
          if (hierarchy) {
            state.scenes.hierarchies[activeSceneId] = {
              version: hierarchy.version,
              description: hierarchy.description,
              rootNodes: ref([...sceneGraph.rootNodes]),
              metadata: hierarchy.metadata,
            };
          }

          // Mark as dirty
          if (descriptor) {
            descriptor.isDirty = true;
            state.scenes.lastLoadedAt = Date.now();
          }
        },
        redo: () => {
          // Re-add node to scene graph
          sceneGraph.rootNodes.push(node);
          sceneGraph.nodeMap.set(nodeId, node);

          // Update state hierarchy - replace to trigger reactivity
          if (hierarchy) {
            state.scenes.hierarchies[activeSceneId] = {
              version: hierarchy.version,
              description: hierarchy.description,
              rootNodes: ref([...sceneGraph.rootNodes]),
              metadata: hierarchy.metadata,
            };
          }

          // Mark as dirty
          if (descriptor) {
            descriptor.isDirty = true;
            state.scenes.lastLoadedAt = Date.now();
          }
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
