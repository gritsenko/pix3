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

export class StopSceneCommand extends CommandBase<void, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.stop',
    title: 'Stop Scene',
    description: 'Stop script execution for the entire scene',
    keywords: ['stop', 'pause', 'halt', 'scripts'],
    menuPath: 'scene',
    shortcut: 'Ctrl+Shift+Enter',
    addToMenu: true,
    menuOrder: 101,
  };

  private readonly scriptExecution: ScriptExecutionService;

  constructor(scriptExecution: ScriptExecutionService) {
    super();
    this.scriptExecution = scriptExecution;
  }

  preconditions(context: CommandContext): CommandPreconditionResult {
    if (!context.snapshot.ui.isPlaying) {
      return {
        canExecute: false,
        reason: 'Scene is not playing',
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
        isPlaying: false,
        status: 'stopped',
      })
    );
    this.scriptExecution.stop();

    return {
      didMutate: true,
      payload: undefined,
    };
  }
}
