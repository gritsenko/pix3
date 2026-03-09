import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';

export interface SetGamePopoutWindowOpenOperationParams {
  isOpen: boolean;
}

export class SetGamePopoutWindowOpenOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.set-game-popout-window-open',
    title: 'Set Game Popout Window State',
    description: 'Update whether the dedicated external game window is open',
    tags: ['scene', 'play-mode', 'ui', 'window'],
  };

  constructor(private readonly params: SetGamePopoutWindowOpenOperationParams) {}

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const previousIsOpen = context.snapshot.ui.isGamePopoutOpen;

    if (previousIsOpen === this.params.isOpen) {
      return { didMutate: false };
    }

    context.state.ui.isGamePopoutOpen = this.params.isOpen;

    return {
      didMutate: true,
      commit: {
        label: this.params.isOpen ? 'Open Game Window' : 'Close Game Window',
        undo: () => {
          context.state.ui.isGamePopoutOpen = previousIsOpen;
        },
        redo: () => {
          context.state.ui.isGamePopoutOpen = this.params.isOpen;
        },
      },
    };
  }
}