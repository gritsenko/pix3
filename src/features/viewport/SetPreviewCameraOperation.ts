import {
  OperationBase,
  type OperationMetadata,
  type OperationContext,
  type OperationInvokeResult,
  type OperationCommit,
} from '@/core/Operation';

export interface SetPreviewCameraParams {
  sceneId?: string | null;
  cameraNodeId: string | null;
}

export class SetPreviewCameraOperation extends OperationBase {
  readonly metadata: OperationMetadata = {
    id: 'viewport.set-preview-camera',
    title: 'Set Preview Camera',
  };

  constructor(private readonly params: SetPreviewCameraParams) {
    super();
  }

  perform(context: OperationContext): OperationInvokeResult {
    const sceneId = this.params.sceneId ?? context.state.scenes.activeSceneId;
    if (!sceneId) {
      return { didMutate: false };
    }

    const previous = context.state.scenes.previewCameraNodeIds[sceneId] ?? null;
    const next = this.params.cameraNodeId;
    if (previous === next) {
      return { didMutate: false };
    }

    context.state.scenes.previewCameraNodeIds[sceneId] = next;

    const commit: OperationCommit = {
      undo: () => {
        context.state.scenes.previewCameraNodeIds[sceneId] = previous;
      },
      redo: () => {
        context.state.scenes.previewCameraNodeIds[sceneId] = next;
      },
    };

    return { didMutate: true, commit };
  }
}
