import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
  type CommandPreconditionResult,
} from './command';
import type { CommandDispatcherService } from './CommandDispatcherService';

/**
 * Command that performs an undo operation by delegating to the CommandDispatcherService
 */
export class UndoCommand extends CommandBase<void, void> {
  readonly metadata: CommandMetadata = {
    id: 'edit.undo',
    title: 'Undo',
    description: 'Undo the last action',
    keywords: ['undo', 'revert', 'history'],
    personas: ['technical-artist', 'gameplay-engineer', 'playable-ad-producer'],
  };

  private readonly dispatcher: CommandDispatcherService;

  constructor(dispatcher: CommandDispatcherService) {
    super();
    this.dispatcher = dispatcher;
  }

  preconditions(_context: CommandContext): CommandPreconditionResult {
    if (!this.dispatcher.canUndo()) {
      return {
        canExecute: false,
        reason: 'No actions available to undo',
        scope: 'service',
        recoverable: false,
      };
    }

    return { canExecute: true };
  }

  async execute(_context: CommandContext): Promise<CommandExecutionResult<void>> {
    const success = await this.dispatcher.undo();

    return {
      didMutate: success,
      payload: undefined,
    };
  }
}
