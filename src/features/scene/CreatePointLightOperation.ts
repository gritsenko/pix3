import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { PointLightNode } from '@/nodes/3D/PointLightNode';
import { SceneManager } from '@/core/SceneManager';
import { ref } from 'valtio/vanilla';
import { Vector3 } from 'three';

export interface CreatePointLightOperationParams {
  lightName?: string;
  color?: string;
  intensity?: number;
  distance?: number;
  decay?: number;
  position?: Vector3;
}

export class CreatePointLightOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-point-light',
    title: 'Create Point Light',
    description: 'Create a point light in the scene',
    tags: ['scene', '3d', 'light', 'node'],
    affectsNodeStructure: true,
  };

  private readonly params: CreatePointLightOperationParams;

  constructor(params: CreatePointLightOperationParams = {}) {
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
    const nodeId = `pointlight-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Create the PointLight node
    const lightName = this.params.lightName || 'Point Light';
    const color = this.params.color ?? '#ffffff';
    const intensity = this.params.intensity ?? 1;
    const distance = this.params.distance ?? 0;
    const decay = this.params.decay ?? 2;

    const node = new PointLightNode({
      id: nodeId,
      name: lightName,
      color,
      intensity,
      distance,
      decay,
    });

    if (this.params.position) {
      node.position.copy(this.params.position);
    }

    // Add to the scene graph
    sceneGraph.rootNode.adoptChild(node);
    sceneGraph.nodeMap.set(nodeId, node);

    // Update the state hierarchy
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

    // Select the newly created node
    state.selection.nodeIds = [nodeId];
    state.selection.primaryNodeId = nodeId;

    return {
      didMutate: true,
      commit: {
        label: `Create ${lightName}`,
        undo: () => {
          sceneGraph.rootNode.children = sceneGraph.rootNode.children.filter(n => n.nodeId !== nodeId);
          sceneGraph.nodeMap.delete(nodeId);

          const currentHierarchy = state.scenes.hierarchies[activeSceneId];
          if (currentHierarchy) {
            state.scenes.hierarchies[activeSceneId] = {
              ...currentHierarchy,
              rootNodes: ref([...sceneGraph.rootNodes]),
            };
          }

          if (state.selection.primaryNodeId === nodeId) {
            state.selection.primaryNodeId = null;
          }
          state.selection.nodeIds = state.selection.nodeIds.filter(id => id !== nodeId);
        },
        redo: () => {
          sceneGraph.rootNode.adoptChild(node);
          sceneGraph.nodeMap.set(nodeId, node);

          const currentHierarchy = state.scenes.hierarchies[activeSceneId];
          if (currentHierarchy) {
            state.scenes.hierarchies[activeSceneId] = {
              ...currentHierarchy,
              rootNodes: ref([...sceneGraph.rootNodes]),
            };
          }

          state.selection.nodeIds = [nodeId];
          state.selection.primaryNodeId = nodeId;
        },
      },
    };
  }
}
