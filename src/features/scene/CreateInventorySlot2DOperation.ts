import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import type { Layout2D } from '@pix3/runtime';
import { InventorySlot2D } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { ref } from 'valtio/vanilla';
import { Vector2 } from 'three';
import {
  attachNode,
  detachNode,
  removeAutoCreatedLayoutIfUnused,
  resolveDefault2DParent,
  restoreAutoCreatedLayout,
} from '@/features/scene/node-placement';

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

    const parentNodeId = this.params.parentNodeId ?? null;
    const parentNode = parentNodeId ? (sceneGraph.nodeMap.get(parentNodeId) ?? null) : null;
    let autoCreatedLayout: Layout2D | null = null;
    const targetParent =
      parentNode ??
      (() => {
        const result = resolveDefault2DParent(sceneGraph);
        autoCreatedLayout = result.createdLayout;
        return result.parent;
      })();

    const updateHierarchyState = () => {
      const hierarchy = state.scenes.hierarchies[activeSceneId];
      if (hierarchy) {
        state.scenes.hierarchies[activeSceneId] = {
          version: hierarchy.version,
          description: hierarchy.description,
          rootNodes: ref([...sceneGraph.rootNodes]),
          metadata: hierarchy.metadata,
        };
      }
    };

    const markSceneDirty = () => {
      const descriptor = state.scenes.descriptors[activeSceneId];
      if (descriptor) {
        descriptor.isDirty = true;
      }
    };

    attachNode(sceneGraph, node, targetParent);
    updateHierarchyState();
    markSceneDirty();

    // Update selection to the new node for payload extraction
    state.selection.nodeIds = [nodeId];

    return {
      didMutate: true,
      commit: {
        label: `Create ${slotName}`,
        undo: () => {
          detachNode(sceneGraph, node, targetParent);
          removeAutoCreatedLayoutIfUnused(sceneGraph, autoCreatedLayout);
          updateHierarchyState();
          markSceneDirty();
        },
        redo: () => {
          attachNode(sceneGraph, node, targetParent);
          restoreAutoCreatedLayout(sceneGraph, autoCreatedLayout);
          updateHierarchyState();
          markSceneDirty();
        },
      },
    };
  }
}
