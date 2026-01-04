import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { DirectionalLightNode } from '@/nodes/3D/DirectionalLightNode';
import { SceneManager } from '@/core/SceneManager';
import { ref } from 'valtio/vanilla';
import { Vector3 } from 'three';

export interface CreateDirectionalLightOperationParams {
  lightName?: string;
  color?: string;
  intensity?: number;
  position?: Vector3;
}

export class CreateDirectionalLightOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-directional-light',
    title: 'Create Directional Light',
    description: 'Create a directional light in the scene',
    tags: ['scene', '3d', 'light', 'node'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateDirectionalLightOperationParams;

  constructor(params: CreateDirectionalLightOperationParams = {}) {
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
    const nodeId = `directionallight-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Create the DirectionalLight node
    const lightName = this.params.lightName || 'Directional Light';
    const color = this.params.color ?? '#ffffff';
    const intensity = this.params.intensity ?? 1;

    const node = new DirectionalLightNode({
      id: nodeId,
      name: lightName,
      color,
      intensity,
    });

    // Add to the scene graph
    sceneGraph.rootNode.adoptChild(node);
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
        label: `Create ${lightName}`,
        undo: () => {
          // Remove from scene graph
          sceneGraph.rootNode.children = sceneGraph.rootNode.children.filter(n => n.nodeId !== nodeId);
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
          sceneGraph.rootNode.adoptChild(node);
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
