import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { PointLightNode } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { Vector3 } from 'three';
import { attachNode, detachNode, resolveDefault3DParent } from '@/features/scene/node-placement';
import { SceneStateUpdater } from '@/core/SceneStateUpdater';

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

    const targetParent = resolveDefault3DParent(sceneGraph);
    attachNode(sceneGraph, node, targetParent);

    SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
    SceneStateUpdater.markSceneDirty(state, activeSceneId);
    SceneStateUpdater.selectNode(state, nodeId);

    return {
      didMutate: true,
      commit: {
        label: `Create ${lightName}`,
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
