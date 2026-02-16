import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';

export interface SetPlayModeOperationParams {
  isPlaying: boolean;
  status: 'stopped' | 'playing' | 'paused';
}

export class SetPlayModeOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.set-play-mode',
    title: 'Set Play Mode',
    description: 'Update global play mode status for the editor runtime',
    tags: ['scene', 'play-mode', 'ui'],
  };

  constructor(private readonly params: SetPlayModeOperationParams) {}

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { state, snapshot } = context;
    const previousIsPlaying = snapshot.ui.isPlaying;
    const previousStatus = snapshot.ui.playModeStatus;

    if (previousIsPlaying === this.params.isPlaying && previousStatus === this.params.status) {
      return { didMutate: false };
    }

    state.ui.isPlaying = this.params.isPlaying;
    state.ui.playModeStatus = this.params.status;

    return {
      didMutate: true,
      commit: {
        label: this.params.isPlaying ? 'Start Play Mode' : 'Stop Play Mode',
        undo: () => {
          state.ui.isPlaying = previousIsPlaying;
          state.ui.playModeStatus = previousStatus;
        },
        redo: () => {
          state.ui.isPlaying = this.params.isPlaying;
          state.ui.playModeStatus = this.params.status;
        },
      },
    };
  }
}
