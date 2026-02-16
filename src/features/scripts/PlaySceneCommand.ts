import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
  type CommandPreconditionResult,
} from '@/core/command';
import { ScriptExecutionService } from '@/services/ScriptExecutionService';
import { OperationService } from '@/services/OperationService';
import { SetPlayModeOperation } from '@/features/scripts/SetPlayModeOperation';

export class PlaySceneCommand extends CommandBase<void, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.play',
    title: 'Play Scene',
    description: 'Start script execution for the entire scene',
    keywords: ['play', 'start', 'run', 'scripts'],
    menuPath: 'scene',
    shortcut: 'Ctrl+Enter',
    addToMenu: true,
    menuOrder: 100,
  };

  private readonly scriptExecution: ScriptExecutionService;

  constructor(scriptExecution: ScriptExecutionService) {
    super();
    this.scriptExecution = scriptExecution;
  }

  preconditions(context: CommandContext): CommandPreconditionResult {
    if (context.snapshot.ui.isPlaying) {
      return {
        canExecute: false,
        reason: 'Scene is already playing',
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
    this.scriptExecution.start();

    return {
      didMutate: true,
      payload: undefined,
    };
  }
}
