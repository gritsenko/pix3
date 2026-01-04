import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { SpotLightNode } from '@/nodes/3D/SpotLightNode';
import { SceneManager } from '@/core/SceneManager';
import { ref } from 'valtio/vanilla';
import { Vector3 } from 'three';

export interface CreateSpotLightOperationParams {
  lightName?: string;
  color?: string;
  intensity?: number;
  distance?: number;
  angle?: number;
  penumbra?: number;
  decay?: number;
  position?: Vector3;
}

export class CreateSpotLightOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-spot-light',
    title: 'Create Spot Light',
    description: 'Create a spot light in the scene',
    tags: ['scene', '3d', 'light', 'node'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateSpotLightOperationParams;

  constructor(params: CreateSpotLightOperationParams = {}) {
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
    const nodeId = `spotlight-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Create the SpotLight node
    const lightName = this.params.lightName || 'Spot Light';
    const color = this.params.color ?? '#ffffff';
    const intensity = this.params.intensity ?? 1;
    const distance = this.params.distance ?? 0;
    const angle = this.params.angle ?? Math.PI / 3;
    const penumbra = this.params.penumbra ?? 0;
    const decay = this.params.decay ?? 2;

    const node = new SpotLightNode({
      id: nodeId,
      name: lightName,
      color,
      intensity,
      distance,
      angle,
      penumbra,
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
