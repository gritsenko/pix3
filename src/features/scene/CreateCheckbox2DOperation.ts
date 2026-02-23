import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import type { Layout2D } from '@pix3/runtime';
import { Checkbox2D } from '@pix3/runtime';
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

export interface CreateCheckbox2DOperationParams {
  checkboxName?: string;
  size?: number;
  position?: Vector2;
  parentNodeId?: string | null;
}

export class CreateCheckbox2DOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-checkbox2d',
    title: 'Create Checkbox2D',
    description: 'Create a 2D checkbox in the scene',
    tags: ['scene', '2d', 'checkbox', 'node', 'ui'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateCheckbox2DOperationParams;

  constructor(params: CreateCheckbox2DOperationParams = {}) {
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

    const nodeId = `checkbox2d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const checkboxName = this.params.checkboxName || 'Checkbox2D';

    const node = new Checkbox2D({
      id: nodeId,
      name: checkboxName,
      position: this.params.position || new Vector2(100, 100),
      size: this.params.size,
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
    state.selection.primaryNodeId = nodeId;

    return {
      didMutate: true,
      commit: {
        label: `Create ${checkboxName}`,
        undo: () => {
          detachNode(sceneGraph, node, targetParent);
          removeAutoCreatedLayoutIfUnused(sceneGraph, autoCreatedLayout);
          updateHierarchyState();
          markSceneDirty();
          if (state.selection.primaryNodeId === nodeId) {
            state.selection.primaryNodeId = null;
          }
          state.selection.nodeIds = state.selection.nodeIds.filter(id => id !== nodeId);
        },
        redo: () => {
          attachNode(sceneGraph, node, targetParent);
          restoreAutoCreatedLayout(sceneGraph, autoCreatedLayout);
          updateHierarchyState();
          markSceneDirty();
          state.selection.nodeIds = [nodeId];
          state.selection.primaryNodeId = nodeId;
        },
      },
    };
  }
}
