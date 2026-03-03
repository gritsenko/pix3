import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { InventorySlot2D } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { Vector2 } from 'three';
import {
  attachNode,
  detachNode,
  resolve2DParentForCreation,
} from '@/features/scene/node-placement';
import { SceneStateUpdater } from '@/core/SceneStateUpdater';

export interface CreateInventorySlot2DOperationParams {
  slotName?: string;
  width?: number;
  height?: number;
  position?: Vector2;
  parentNodeId?: string | null;
}

export class CreateInventorySlot2DOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-inventoryslot2d',
    title: 'Create InventorySlot2D',
    description: 'Create a 2D inventory slot in the scene',
    tags: ['scene', '2d', 'inventory', 'slot', 'node', 'ui'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateInventorySlot2DOperationParams;

  constructor(params: CreateInventorySlot2DOperationParams = {}) {
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

    const nodeId = `inventoryslot2d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const slotName = this.params.slotName || 'InventorySlot2D';

    const node = new InventorySlot2D({
      id: nodeId,
      name: slotName,
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
        label: `Create ${slotName}`,
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
