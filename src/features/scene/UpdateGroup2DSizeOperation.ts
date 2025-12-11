import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { Group2D } from '@/nodes/2D/Group2D';
import { SceneManager } from '@/core/SceneManager';
import { ViewportRendererService } from '@/services/ViewportRenderService';

export interface UpdateGroup2DSizeParams {
  nodeId: string;
  width: number;
  height: number;
}

export class UpdateGroup2DSizeOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.update-group2d-size',
    title: 'Update Group2D Size',
    description: 'Update the width and height of a Group2D node',
    tags: ['property', 'group2d', 'size'],
  };

  private readonly params: UpdateGroup2DSizeParams;

  constructor(params: UpdateGroup2DSizeParams) {
    this.params = params;
  }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { container, state } = context;
    const { nodeId, width, height } = this.params;

    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );
    const sceneGraph = sceneManager.getActiveSceneGraph();
    if (!sceneGraph) {
      return { didMutate: false };
    }

    const node = sceneGraph.nodeMap.get(nodeId);
    if (!(node instanceof Group2D)) {
      return { didMutate: false };
    }

    if (width <= 0 || height <= 0) {
      return { didMutate: false };
    }

    const previousWidth = node.width;
    const previousHeight = node.height;

    if (previousWidth === width && previousHeight === height) {
      return { didMutate: false };
    }

    node.setSize(width, height);

    const activeSceneId = state.scenes.activeSceneId;
    if (activeSceneId) {
      state.scenes.lastLoadedAt = Date.now();
      const descriptor = state.scenes.descriptors[activeSceneId];
      if (descriptor) descriptor.isDirty = true;
    }

    try {
      const vr = container.getService<ViewportRendererService>(
        container.getOrCreateToken(ViewportRendererService)
      );
      vr.updateSelection();
      // eslint-disable-next-line no-empty
    } catch {}

    return {
      didMutate: true,
      commit: {
        label: 'Update Group2D Size',
        beforeSnapshot: context.snapshot,
        undo: async () => {
          node.setSize(previousWidth, previousHeight);
          if (activeSceneId) {
            state.scenes.lastLoadedAt = Date.now();
            const descriptor = state.scenes.descriptors[activeSceneId];
            if (descriptor) descriptor.isDirty = true;
          }
          try {
            const vr = container.getService<ViewportRendererService>(
              container.getOrCreateToken(ViewportRendererService)
            );
            vr.updateSelection();
            // eslint-disable-next-line no-empty
          } catch {}
        },
        redo: async () => {
          node.setSize(width, height);
          if (activeSceneId) {
            state.scenes.lastLoadedAt = Date.now();
            const descriptor = state.scenes.descriptors[activeSceneId];
            if (descriptor) descriptor.isDirty = true;
          }
          try {
            const vr = container.getService<ViewportRendererService>(
              container.getOrCreateToken(ViewportRendererService)
            );
            vr.updateSelection();
            // eslint-disable-next-line no-empty
          } catch {}
        },
      },
    };
  }
}
