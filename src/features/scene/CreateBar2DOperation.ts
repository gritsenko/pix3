import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { Bar2D } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { Vector2 } from 'three';
import {
  attachNode,
  detachNode,
  resolve2DParentForCreation,
} from '@/features/scene/node-placement';
import { SceneStateUpdater } from '@/core/SceneStateUpdater';

export interface CreateBar2DOperationParams {
  barName?: string;
  width?: number;
  height?: number;
  position?: Vector2;
  parentNodeId?: string | null;
}

export class CreateBar2DOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-bar2d',
    title: 'Create Bar2D',
    description: 'Create a 2D bar (progress/HP/energy) in the scene',
    tags: ['scene', '2d', 'bar', 'node', 'ui'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateBar2DOperationParams;

  constructor(params: CreateBar2DOperationParams = {}) {
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

    const nodeId = `bar2d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const barName = this.params.barName || 'Bar2D';

    const node = new Bar2D({
      id: nodeId,
      name: barName,
      position: this.params.position || new Vector2(100, 100),
      width: this.params.width,
      height: this.params.height,
    });

    const targetParent = resolve2DParentForCreation(
      sceneGraph,
      this.params.parentNodeId ?? null,
      state.selection.primaryNodeId
    );

    attachNode(sceneGraph, node, targetParent);
    SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
    SceneStateUpdater.markSceneDirty(state, activeSceneId);
    SceneStateUpdater.selectNode(state, nodeId);

    return {
      didMutate: true,
      commit: {
        label: `Create ${barName}`,
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
