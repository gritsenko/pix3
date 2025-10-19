import { injectable } from '@/fw/di';
import { appState, getAppStateSnapshot } from '@/state';
import { ServiceContainer } from '@/fw/di';
import {
  createCommandContext,
  type Command,
  type CommandContext,
  type CommandPreconditionResult,
} from '@/core/command';

/**
 * CommandDispatcher executes commands with proper lifecycle management.
 * It creates appropriate context, checks preconditions, and invokes command execution.
 */
@injectable()
export class CommandDispatcher {
  constructor() {}

  /**
   * Execute a command. First checks preconditions, then invokes execute.
   * @param command The command to execute
   * @returns True if command executed successfully, false if preconditions blocked it
   */
  async execute<TExecutePayload = void, TUndoPayload = void>(
    command: Command<TExecutePayload, TUndoPayload>
  ): Promise<boolean> {
    const context = this.createContext();

    // Check preconditions
    const preconditionsResult = await this.checkPreconditions(command, context);
    if (!preconditionsResult.canExecute) {
      console.warn(
        `[CommandDispatcher] Command preconditions blocked: ${command.metadata.id}`,
        preconditionsResult
      );
      return false;
    }

    // Execute command
    try {
      const result = await command.execute(context);
      return result.didMutate;
    } catch (error) {
      console.error(`[CommandDispatcher] Command execution failed: ${command.metadata.id}`, error);
      throw error;
    }
  }

  /**
   * Create a command context with current app state and service container.
   */
  private createContext(): CommandContext {
    return createCommandContext(appState, getAppStateSnapshot(), ServiceContainer.getInstance());
  }

  /**
   * Check if command preconditions are satisfied.
   */
  private async checkPreconditions(
    command: Command<any, any>,
    context: CommandContext
  ): Promise<CommandPreconditionResult> {
    if (!command.preconditions) {
      return { canExecute: true };
    }

    try {
      return await Promise.resolve(command.preconditions(context));
    } catch (error) {
      console.error(
        `[CommandDispatcher] Preconditions check failed: ${command.metadata.id}`,
        error
      );
      return { canExecute: false, reason: 'Preconditions check failed', scope: 'service' };
    }
  }

  dispose(): void {
    // No resources to clean up
  }
}

export const resolveCommandDispatcher = (): CommandDispatcher => {
  return ServiceContainer.getInstance().getService(
    ServiceContainer.getInstance().getOrCreateToken(CommandDispatcher)
  ) as CommandDispatcher;
};
