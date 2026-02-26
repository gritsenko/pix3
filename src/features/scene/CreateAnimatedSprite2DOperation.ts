import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import type { Layout2D } from '@pix3/runtime';
import { AnimatedSprite2D } from '@pix3/runtime';
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

export interface CreateAnimatedSprite2DOperationParams {
  nodeName?: string;
  position?: Vector2;
  parentNodeId?: string | null;
}

export class CreateAnimatedSprite2DOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-animatedsprite2d',
    title: 'Create AnimatedSprite2D',
    description: 'Create a 2D animated sprite in the scene',
    tags: ['scene', '2d', 'animated', 'sprite', 'node', 'ui'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateAnimatedSprite2DOperationParams;

  constructor(params: CreateAnimatedSprite2DOperationParams = {}) {
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

    const nodeId = `animatedsprite2d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const nodeName = this.params.nodeName || 'AnimatedSprite2D';

    const node = new AnimatedSprite2D({
      id: nodeId,
      name: nodeName,
      position: this.params.position || new Vector2(100, 100),
      width: 64,
      height: 64,
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
