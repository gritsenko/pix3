import {
  OperationBase,
  type OperationMetadata,
  type OperationContext,
  type OperationInvokeResult,
  type OperationCommit,
} from '@/core/Operation';
import type { UIState } from '@/state/AppState';

type BooleanUIFlag = {
  [K in keyof UIState]: UIState[K] extends boolean ? K : never;
}[keyof UIState];

export class ToggleUIFlagOperation extends OperationBase {
  readonly metadata: OperationMetadata;
  private readonly flag: BooleanUIFlag;

  constructor(flag: BooleanUIFlag, title: string) {
    super();
    this.flag = flag;
    this.metadata = {
      id: `ui.toggle-${flag}`,
      title,
    };
  }

  perform(context: OperationContext): OperationInvokeResult {
    const state = context.state;
    const previous = state.ui[this.flag] as boolean;
    state.ui[this.flag] = !previous;

    const flag = this.flag;
    const commit: OperationCommit = {
      undo() {
        state.ui[flag] = previous;
      },
      redo() {
        state.ui[flag] = !previous;
      },
    };

    return { didMutate: true, commit };
  }
}
