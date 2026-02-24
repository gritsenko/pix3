import {
  CommandBase,
  type CommandExecutionResult,
  type CommandContext,
  type CommandPreconditionResult,
  type CommandMetadata,
} from '@/core/command';
import { EditorTabService } from '@/services/EditorTabService';
import { OperationService } from '@/services/OperationService';
import { SetPlayModeOperation } from '@/features/scripts/SetPlayModeOperation';

export class StartGameCommand extends CommandBase<void, void> {
  readonly metadata: CommandMetadata = {
    id: 'game.start',
    title: 'Start Game',
    description: 'Start the game in a new tab',
    keywords: ['play', 'game', 'start'],
    menuPath: 'project',
    keybinding: 'Mod+Ctrl+Enter',
    addToMenu: true,
    menuOrder: 102,
  };

  private readonly editorTabService: EditorTabService;

  constructor(editorTabService: EditorTabService) {
    super();
    this.editorTabService = editorTabService;
  }

  preconditions(context: CommandContext): CommandPreconditionResult {
    if (context.snapshot.ui.isPlaying) {
      return {
        canExecute: false,
        reason: 'Game is already running',
        scope: 'scene',
        recoverable: false,
      };
    }

    return { canExecute: true };
  }

  async execute(context: CommandContext): Promise<CommandExecutionResult<void>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );

    await operationService.invoke(
      new SetPlayModeOperation({
        isPlaying: true,
        status: 'playing',
      })
    );

    const gameTabResourceId = 'game-view-instance';
    await this.editorTabService.openResourceTab('game', gameTabResourceId, {}, true);

    return {
      didMutate: true,
      payload: undefined,
    };
  }
}
