import {
  OperationBase,
  type OperationCommit,
  type OperationContext,
  type OperationInvokeResult,
  type OperationMetadata,
} from '@/core/Operation';
import type { EditorCameraProjection } from '@/state';

export interface SetEditorCameraProjectionParams {
  projection: EditorCameraProjection;
}

export class SetEditorCameraProjectionOperation extends OperationBase {
  readonly metadata: OperationMetadata = {
    id: 'viewport.set-editor-camera-projection',
    title: 'Set Editor Camera Projection',
  };

  constructor(private readonly params: SetEditorCameraProjectionParams) {
    super();
  }

  perform(context: OperationContext): OperationInvokeResult {
    const previous = context.state.ui.editorCameraProjection;
    const next = this.params.projection;

    if (previous === next) {
      return { didMutate: false };
    }

    context.state.ui.editorCameraProjection = next;

    const commit: OperationCommit = {
      undo: () => {
        context.state.ui.editorCameraProjection = previous;
      },
      redo: () => {
        context.state.ui.editorCameraProjection = next;
      },
    };

    return { didMutate: true, commit };
  }
}
