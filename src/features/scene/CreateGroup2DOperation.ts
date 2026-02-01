import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { Group2D } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { ref } from 'valtio/vanilla';
import { Vector2 } from 'three';

export interface CreateGroup2DOperationParams {
  groupName?: string;
  width?: number;
  height?: number;
  position?: Vector2;
}

export class CreateGroup2DOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-group2d',
    title: 'Create Group2D',
    description: 'Create a 2D group container in the scene',
    tags: ['scene', '2d', 'group', 'node', 'container'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateGroup2DOperationParams;

  constructor(params: CreateGroup2DOperationParams = {}) {
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
    const nodeId = `group2d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Create the Group2D node
    const groupName = this.params.groupName || 'Group2D';
    const width = this.params.width ?? 100;
    const height = this.params.height ?? 100;

    const node = new Group2D({
      id: nodeId,
      name: groupName,
      width,
      height,
      position: this.params.position,
    });

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
    }

    // Select the newly created node
    state.selection.nodeIds = [nodeId];
    state.selection.primaryNodeId = nodeId;

    return {
      didMutate: true,
      commit: {
        label: `Create ${groupName}`,
        undo: () => {
          // Remove from scene graph
          sceneGraph.rootNodes = sceneGraph.rootNodes.filter(n => n.nodeId !== nodeId);
          sceneGraph.nodeMap.delete(nodeId);

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

          // Mark scene as dirty
          const descriptor = state.scenes.descriptors[activeSceneId];
          if (descriptor) {
            descriptor.isDirty = true;
          }

          // Clear selection if this node was selected
          if (state.selection.nodeIds.includes(nodeId)) {
            state.selection.nodeIds = [];
            state.selection.primaryNodeId = null;
          }
        },
        redo: () => {
          // Re-add to scene graph
          sceneGraph.rootNodes.push(node);
          sceneGraph.nodeMap.set(nodeId, node);

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

          // Mark scene as dirty
          const descriptor = state.scenes.descriptors[activeSceneId];
          if (descriptor) {
            descriptor.isDirty = true;
          }

          // Select the node
          state.selection.nodeIds = [nodeId];
          state.selection.primaryNodeId = nodeId;
        },
      },
    };
  }
}
