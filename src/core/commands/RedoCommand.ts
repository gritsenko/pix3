import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
  type CommandPreconditionResult,
} from './command';
import type { CommandDispatcherService } from './CommandDispatcherService';

/**
 * Command that performs a redo operation by delegating to the CommandDispatcherService
 */
export class RedoCommand extends CommandBase<void, void> {
  readonly metadata: CommandMetadata = {
    id: 'edit.redo',
    title: 'Redo',
    description: 'Redo the last undone action',
    keywords: ['redo', 'history'],
    personas: ['technical-artist', 'gameplay-engineer', 'playable-ad-producer'],
  };

  private readonly dispatcher: CommandDispatcherService;

  constructor(dispatcher: CommandDispatcherService) {
    super();
    this.dispatcher = dispatcher;
  }

  preconditions(_context: CommandContext): CommandPreconditionResult {
    if (!this.dispatcher.canRedo()) {
      return {
        canExecute: false,
        reason: 'No actions available to redo',
        scope: 'service',
        recoverable: false,
      };
    }

    return { canExecute: true };
  }

  async execute(_context: CommandContext): Promise<CommandExecutionResult<void>> {
    const success = await this.dispatcher.redo();

    return {
      didMutate: success,
      payload: undefined,
    };
  }
}
