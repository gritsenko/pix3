import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import type { Layout2D } from '@pix3/runtime';
import { Bar2D } from '@pix3/runtime';
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
        label: `Create ${barName}`,
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
