import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { Button2D } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { Vector2 } from 'three';
import {
  attachNode,
  detachNode,
  resolve2DParentForCreation,
} from '@/features/scene/node-placement';
import { SceneStateUpdater } from '@/core/SceneStateUpdater';

export interface CreateButton2DOperationParams {
  buttonName?: string;
  width?: number;
  height?: number;
  position?: Vector2;
  parentNodeId?: string | null;
}

export class CreateButton2DOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-button2d',
    title: 'Create Button2D',
    description: 'Create a 2D button in the scene',
    tags: ['scene', '2d', 'button', 'node', 'ui'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateButton2DOperationParams;

  constructor(params: CreateButton2DOperationParams = {}) {
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

    const nodeId = `button2d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const buttonName = this.params.buttonName || 'Button2D';

    const node = new Button2D({
      id: nodeId,
      name: buttonName,
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
        label: `Create ${buttonName}`,
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
