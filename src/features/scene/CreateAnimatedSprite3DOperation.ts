import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { AnimatedSprite3D } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { Vector3 } from 'three';
import { SceneStateUpdater } from '@/core/SceneStateUpdater';
import {
  attachNode,
  detachNode,
  resolveDefault3DParent,
} from '@/features/scene/node-placement';

export interface CreateAnimatedSprite3DOperationParams {
  nodeName?: string;
  position?: Vector3;
  parentNodeId?: string | null;
}

export class CreateAnimatedSprite3DOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-animatedsprite3d',
    title: 'Create AnimatedSprite3D',
    description: 'Create a 3D animated sprite in the scene',
    tags: ['scene', '3d', 'animated', 'sprite', 'node'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateAnimatedSprite3DOperationParams;

  constructor(params: CreateAnimatedSprite3DOperationParams = {}) {
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

    const nodeId = `animatedsprite3d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const nodeName = this.params.nodeName || 'AnimatedSprite3D';

    const node = new AnimatedSprite3D({
      id: nodeId,
      name: nodeName,
      position: this.params.position || new Vector3(0, 0, 0),
      width: 1,
      height: 1,
    });

    const parentNodeId = this.params.parentNodeId ?? null;
    const parentNode = parentNodeId ? (sceneGraph.nodeMap.get(parentNodeId) ?? null) : null;
    const targetParent = parentNode ?? resolveDefault3DParent(sceneGraph);

    attachNode(sceneGraph, node, targetParent);
    SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
    SceneStateUpdater.markSceneDirty(state, activeSceneId);
    SceneStateUpdater.selectNode(state, nodeId);

    return {
      didMutate: true,
      commit: {
        label: `Create ${nodeName}`,
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
