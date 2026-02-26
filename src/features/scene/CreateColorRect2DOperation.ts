import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import type { Layout2D } from '@pix3/runtime';
import { ColorRect2D } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { Vector2 } from 'three';
import { SceneStateUpdater } from '@/core/SceneStateUpdater';
import {
  attachNode,
  detachNode,
  removeAutoCreatedLayoutIfUnused,
  resolveDefault2DParent,
  restoreAutoCreatedLayout,
} from '@/features/scene/node-placement';

export interface CreateColorRect2DOperationParams {
  nodeName?: string;
  position?: Vector2;
  parentNodeId?: string | null;
}

export class CreateColorRect2DOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-colorrect2d',
    title: 'Create ColorRect2D',
    description: 'Create a 2D color rectangle in the scene',
    tags: ['scene', '2d', 'color', 'rect', 'node', 'ui'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateColorRect2DOperationParams;

  constructor(params: CreateColorRect2DOperationParams = {}) {
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

    const nodeId = `colorrect2d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const nodeName = this.params.nodeName || 'ColorRect2D';

    const node = new ColorRect2D({
      id: nodeId,
      name: nodeName,
      position: this.params.position || new Vector2(100, 100),
      width: 100,
      height: 100,
      color: '#ffffff',
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
          removeAutoCreatedLayoutIfUnused(sceneGraph, autoCreatedLayout);
          SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
          SceneStateUpdater.markSceneDirty(state, activeSceneId);
          SceneStateUpdater.clearSelectionIfTargeted(state, nodeId);
        },
        redo: () => {
          attachNode(sceneGraph, node, targetParent);
          restoreAutoCreatedLayout(sceneGraph, autoCreatedLayout);
          SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
          SceneStateUpdater.markSceneDirty(state, activeSceneId);
          SceneStateUpdater.selectNode(state, nodeId);
        },
      },
    };
  }
}
