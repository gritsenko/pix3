import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
  type CommandPreconditionResult,
} from '@/core/command';
import { ScriptExecutionService } from '@/services/ScriptExecutionService';
import { appState } from '@/state';

export class PlaySceneCommand extends CommandBase<void, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.play',
    title: 'Play Scene',
    description: 'Start script execution for the entire scene',
    keywords: ['play', 'start', 'run', 'scripts'],
    menuPath: 'scene',
    shortcut: 'F5',
    addToMenu: true,
    menuOrder: 100,
  };

  private readonly scriptExecution: ScriptExecutionService;

  constructor(scriptExecution: ScriptExecutionService) {
    super();
    this.scriptExecution = scriptExecution;
  }

  preconditions(_context: CommandContext): CommandPreconditionResult {
    if (appState.ui.isPlaying) {
      return {
        canExecute: false,
        reason: 'Scene is already playing',
        scope: 'scene',
        recoverable: false,
      };
    }

    return { canExecute: true };
  }

  async execute(_context: CommandContext): Promise<CommandExecutionResult<void>> {
    appState.ui.isPlaying = true;
    this.scriptExecution.start();

    return {
      didMutate: false,
      payload: undefined,
    };
  }
}
