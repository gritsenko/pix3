import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { Camera3D } from '@/nodes/3D/Camera3D';
import { SceneManager } from '@/core/SceneManager';
import { ref } from 'valtio/vanilla';
import { Vector3 } from 'three';

export interface CreateCamera3DOperationParams {
  cameraName?: string;
  projection?: 'perspective' | 'orthographic';
  fov?: number;
  position?: Vector3;
}

export class CreateCamera3DOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-camera3d',
    title: 'Create Camera3D',
    description: 'Create a 3D camera in the scene',
    tags: ['scene', '3d', 'camera', 'node'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateCamera3DOperationParams;

  constructor(params: CreateCamera3DOperationParams = {}) {
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
    const nodeId = `camera3d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Create the Camera3D node
    const cameraName = this.params.cameraName || 'Camera3D';
    const projection = this.params.projection ?? 'perspective';
    const fov = this.params.fov ?? 60;

    const node = new Camera3D({
      id: nodeId,
      name: cameraName,
      projection,
      fov,
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
        label: `Create ${cameraName}`,
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
