import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { Camera3D } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { Vector3 } from 'three';
import { attachNode, detachNode, resolveDefault3DParent } from '@/features/scene/node-placement';
import { SceneStateUpdater } from '@/core/SceneStateUpdater';

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

    const targetParent = resolveDefault3DParent(sceneGraph);
    attachNode(sceneGraph, node, targetParent);

    SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
    SceneStateUpdater.markSceneDirty(state, activeSceneId);
    SceneStateUpdater.selectNode(state, nodeId);

    return {
      didMutate: true,
      commit: {
        label: `Create ${cameraName}`,
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
