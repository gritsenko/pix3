import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
  type CommandPreconditionResult,
} from '@/core/command';
import { ScriptExecutionService } from '@/services/ScriptExecutionService';
import { appState } from '@/state';

export class StopSceneCommand extends CommandBase<void, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.stop',
    title: 'Stop Scene',
    description: 'Stop script execution for the entire scene',
    keywords: ['stop', 'pause', 'halt', 'scripts'],
    menuPath: 'scene',
    shortcut: 'Shift+F5',
    addToMenu: true,
    menuOrder: 101,
  };

  private readonly scriptExecution: ScriptExecutionService;

  constructor(scriptExecution: ScriptExecutionService) {
    super();
    this.scriptExecution = scriptExecution;
  }

  preconditions(_context: CommandContext): CommandPreconditionResult {
    if (!appState.ui.isPlaying) {
      return {
        canExecute: false,
        reason: 'Scene is not playing',
        scope: 'scene',
        recoverable: false,
      };
    }

    return { canExecute: true };
  }

  async execute(_context: CommandContext): Promise<CommandExecutionResult<void>> {
    appState.ui.isPlaying = false;
    this.scriptExecution.stop();

    return {
      didMutate: false,
      payload: undefined,
    };
  }
}
