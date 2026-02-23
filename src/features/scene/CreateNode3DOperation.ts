import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { Node3D } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { ref } from 'valtio/vanilla';
import { attachNode, detachNode, resolveDefault3DParent } from '@/features/scene/node-placement';

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
        label: `Create ${nodeName}`,
        undo: () => {
          detachNode(sceneGraph, node, targetParent);

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

          // Select nothing or reset
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

          // Select the created node
          state.selection.nodeIds = [nodeId];
          state.selection.primaryNodeId = nodeId;
        },
      },
    };
  }
}
