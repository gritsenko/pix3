import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import type { Layout2D } from '@pix3/runtime';
import type { NodeBase } from '@pix3/runtime';
import { Sprite2D } from '@pix3/runtime';
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

export interface CreateSprite2DOperationParams {
  spriteName?: string;
  width?: number;
  height?: number;
  position?: Vector2;
  texturePath?: string | null;
  parentNodeId?: string | null;
}

export class CreateSprite2DOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-sprite2d',
    title: 'Create Sprite2D',
    description: 'Create a 2D sprite in the scene',
    tags: ['scene', '2d', 'sprite', 'node'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateSprite2DOperationParams;

  constructor(params: CreateSprite2DOperationParams = {}) {
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

    const nodeId = `sprite2d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const spriteName = this.params.spriteName || 'Sprite2D';
    const texturePath = this.params.texturePath ?? null;

    const node = new Sprite2D({
      id: nodeId,
      name: spriteName,
      position: this.params.position,
      texturePath,
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

    const selectCreatedNode = () => {
      state.selection.nodeIds = [nodeId];
      state.selection.primaryNodeId = nodeId;
    };

    const clearSelectionIfTargeted = () => {
      if (state.selection.nodeIds.includes(nodeId)) {
        state.selection.nodeIds = [];
        state.selection.primaryNodeId = null;
      }
    };

    const attachCreatedNode = (targetParentNode: NodeBase | null) => {
      attachNode(sceneGraph, node, targetParentNode);
      updateHierarchyState();
      markSceneDirty();
    };

    const detachCreatedNode = (targetParentNode: NodeBase | null) => {
      detachNode(sceneGraph, node, targetParentNode);
      updateHierarchyState();
      markSceneDirty();
    };

    attachCreatedNode(targetParent);
    selectCreatedNode();

    return {
      didMutate: true,
      commit: {
        label: `Create ${spriteName}`,
        undo: () => {
          detachCreatedNode(targetParent);
          removeAutoCreatedLayoutIfUnused(sceneGraph, autoCreatedLayout);
          updateHierarchyState();
          markSceneDirty();
          clearSelectionIfTargeted();
        },
        redo: () => {
          restoreAutoCreatedLayout(sceneGraph, autoCreatedLayout);
          attachCreatedNode(targetParent);
          selectCreatedNode();
        },
      },
    };
  }
}
