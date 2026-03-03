import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { Joystick2D } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { Vector2 } from 'three';
import {
  attachNode,
  detachNode,
  resolve2DParentForCreation,
} from '@/features/scene/node-placement';
import { SceneStateUpdater } from '@/core/SceneStateUpdater';

export interface CreateJoystick2DOperationParams {
  joystickName?: string;
  radius?: number;
  handleRadius?: number;
  position?: Vector2;
  parentNodeId?: string | null;
}

export class CreateJoystick2DOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-joystick2d',
    title: 'Create Joystick2D',
    description: 'Create a 2D joystick in the scene',
    tags: ['scene', '2d', 'joystick', 'node'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateJoystick2DOperationParams;

  constructor(params: CreateJoystick2DOperationParams = {}) {
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

    const nodeId = `joystick2d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const joystickName = this.params.joystickName || 'Joystick2D';

    const node = new Joystick2D({
      id: nodeId,
      name: joystickName,
      position: this.params.position || new Vector2(100, 100), // Default position for visibility
      radius: this.params.radius,
      handleRadius: this.params.handleRadius,
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
        label: `Create ${joystickName}`,
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
