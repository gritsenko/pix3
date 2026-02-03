import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { Layout2D, ResolutionPreset } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';

export interface UpdateLayout2DSizeOperationParams {
  nodeId: string;
  width?: number;
  height?: number;
  resolutionPreset?: string;
}

export class UpdateLayout2DSizeOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.update-layout2d-size',
    title: 'Update Layout2D Size',
    description: 'Update Layout2D viewport dimensions',
    tags: ['scene', 'layout2d', 'viewport', 'size'],
  };

  private readonly params: UpdateLayout2DSizeOperationParams;

  constructor(params: UpdateLayout2DSizeOperationParams) {
    this.params = params;
  }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { container } = context;
    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );
    const sceneGraph = sceneManager.getActiveSceneGraph();
    if (!sceneGraph) {
      return { didMutate: false };
    }

    const node = sceneGraph.nodeMap.get(this.params.nodeId) as Layout2D | null;
    if (!node || !(node instanceof Layout2D)) {
      console.warn(
        `[UpdateLayout2DSizeOperation] Node ${this.params.nodeId} not found or not Layout2D`
      );
      return { didMutate: false };
    }

    const previousWidth = node.width;
    const previousHeight = node.height;
    const previousPreset = node.resolutionPreset;
    const previousShowOutline = node.showViewportOutline;

    if (this.params.width !== undefined) {
      node.width = this.params.width;
    }
    if (this.params.height !== undefined) {
      node.height = this.params.height;
    }
    if (this.params.resolutionPreset !== undefined) {
      node.resolutionPreset = this.params.resolutionPreset as ResolutionPreset;
    }

    return {
      didMutate: true,
      commit: {
        label: 'Update Layout2D Size',
        undo: () => {
          node.width = previousWidth;
          node.height = previousHeight;
          node.resolutionPreset = previousPreset;
          node.showViewportOutline = previousShowOutline;
        },
        redo: () => {
          if (this.params.width !== undefined) {
            node.width = this.params.width;
          }
          if (this.params.height !== undefined) {
            node.height = this.params.height;
          }
          if (this.params.resolutionPreset !== undefined) {
            node.resolutionPreset = this.params.resolutionPreset as ResolutionPreset;
          }
        },
      },
    };
  }
}
