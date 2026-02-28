import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { DirectionalLightNode } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { Vector3 } from 'three';
import { attachNode, detachNode, resolveDefault3DParent } from '@/features/scene/node-placement';
import { SceneStateUpdater } from '@/core/SceneStateUpdater';

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
    const sunPosition = this.params.position ?? new Vector3(20, 25, 15);
    node.position.copy(sunPosition);
    node.setTargetPosition(new Vector3(0, 0, 0));

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
