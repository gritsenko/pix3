import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { GeometryMesh } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { ref } from 'valtio/vanilla';
import { attachNode, detachNode, resolveDefault3DParent } from '@/features/scene/node-placement';

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

    const targetParent = resolveDefault3DParent(sceneGraph);
    attachNode(sceneGraph, node, targetParent);

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
    }

    // Select the newly created node
    state.selection.nodeIds = [nodeId];
    state.selection.primaryNodeId = nodeId;

    return {
      didMutate: true,
      commit: {
        label: `Create ${boxName}`,
        undo: () => {
          detachNode(sceneGraph, node, targetParent);

          // Dispose the node
          node.dispose();

          // Update state hierarchy
          const hierarchy = state.scenes.hierarchies[activeSceneId];
          if (hierarchy) {
            state.scenes.hierarchies[activeSceneId] = {
              version: hierarchy.version,
              description: hierarchy.description,
              rootNodes: ref([...sceneGraph.rootNodes]),
              metadata: hierarchy.metadata,
            };
          }

          // Clear selection
          state.selection.nodeIds = [];
          state.selection.primaryNodeId = null;
        },
        redo: async () => {
          attachNode(sceneGraph, node, targetParent);

          // Update state hierarchy
          const hierarchy = state.scenes.hierarchies[activeSceneId];
          if (hierarchy) {
            state.scenes.hierarchies[activeSceneId] = {
              version: hierarchy.version,
              description: hierarchy.description,
              rootNodes: ref([...sceneGraph.rootNodes]),
              metadata: hierarchy.metadata,
            };
          }

          // Restore selection
          state.selection.nodeIds = [nodeId];
          state.selection.primaryNodeId = nodeId;
        },
      },
    };
  }
}
