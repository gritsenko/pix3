import { injectable } from '@/fw/di';
import {
  type Command,
  type CommandContext,
  createCommandContext,
  emitCommandTelemetry,
} from '@/core/commands/command';
import { HistoryManager, type HistoryEntryInit } from '@/core/history';
import { appState, getAppStateSnapshot, type AppState } from '@/state';

export interface CommandExecutionOptions {
  /** Whether to push the command to history for undo/redo. Default: true */
  pushToHistory?: boolean;
  /** Optional label for the history entry */
  historyLabel?: string;
  /** Coalesce key for grouping similar operations */
  coalesceKey?: string;
}

export interface CommandExecutionResult<TExecutePayload = void> {
  readonly success: boolean;
  readonly didMutate: boolean;
  readonly pushedToHistory: boolean;
  readonly payload?: TExecutePayload;
  readonly error?: unknown;
}

/**
 * Service responsible for executing commands with full lifecycle support
 * and integration with the undo/redo history system.
 *
 * Commands follow the lifecycle:
 * 1. preconditions() - validates if command can execute
 * 2. execute() - performs the state mutation
 * 3. postCommit() - returns undo payload for history
 */
@injectable()
export class CommandDispatcherService {
  private readonly history: HistoryManager;
  private readonly state: AppState;

  constructor(historyManager?: HistoryManager, state: AppState = appState) {
    this.history = historyManager ?? new HistoryManager();
    this.state = state;
  }

  dispose(): void {
    // Cleanup if needed
  }

  /**
   * Execute a command with full lifecycle support
   */
  async execute<TExecutePayload = void, TUndoPayload = void>(
    command: Command<TExecutePayload, TUndoPayload>,
    options: CommandExecutionOptions = {}
  ): Promise<CommandExecutionResult<TExecutePayload>> {
    const { pushToHistory = true, historyLabel, coalesceKey } = options;
    const requestedAt = Date.now();

    try {
      // Create command context
      const snapshot = getAppStateSnapshot();
      const context: CommandContext = createCommandContext(this.state, snapshot);

      // Check preconditions
      if (command.preconditions) {
        const preconditionResult = await Promise.resolve(command.preconditions(context));
        if (!preconditionResult.canExecute) {
          await emitCommandTelemetry({
            commandId: command.metadata.id,
            status: 'preconditions-blocked',
            requestedAt,
            completedAt: Date.now(),
            durationMs: Date.now() - requestedAt,
            metadata: command.metadata,
          });

          return {
            success: false,
            didMutate: false,
            pushedToHistory: false,
            error: new Error(
              preconditionResult.reason ?? 'Preconditions failed for command execution'
            ),
          };
        }
      }

      // Execute command
      const executionResult = await Promise.resolve(command.execute(context));

      // Get undo payload if command mutated state
      let undoPayload: TUndoPayload | undefined;
      if (executionResult.didMutate && command.postCommit) {
        undoPayload = await Promise.resolve(command.postCommit(context, executionResult.payload));
      }

      // Push to history if requested and command mutated state
      let pushedToHistory = false;
      if (pushToHistory && executionResult.didMutate && undoPayload !== undefined) {
        pushedToHistory = this.pushToHistory(command, undoPayload, context, {
          historyLabel,
          coalesceKey,
        });
      }

      // Update operation state
      if (executionResult.didMutate) {
        this.state.operations.lastCommandId = command.metadata.id;
        if (pushedToHistory) {
          this.state.operations.lastUndoableCommandId = command.metadata.id;
        }
      }

      // Emit telemetry
      await emitCommandTelemetry({
        commandId: command.metadata.id,
        status: 'executed',
        requestedAt,
        completedAt: Date.now(),
        durationMs: Date.now() - requestedAt,
        metadata: command.metadata,
      });

      return {
        success: true,
        didMutate: executionResult.didMutate,
        pushedToHistory,
        payload: executionResult.payload,
      };
    } catch (error) {
      // Emit failure telemetry
      await emitCommandTelemetry({
        commandId: command.metadata.id,
        status: 'failed',
        requestedAt,
        completedAt: Date.now(),
        durationMs: Date.now() - requestedAt,
        metadata: command.metadata,
        error,
      });

      return {
        success: false,
        didMutate: false,
        pushedToHistory: false,
        error,
      };
    }
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this.history.canUndo;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this.history.canRedo;
  }

  /**
   * Undo the last command
   */
  async undo(): Promise<boolean> {
    if (!this.history.canUndo) {
      return false;
    }

    try {
      this.state.operations.isExecuting = true;
      const undone = await this.history.undo();
      return undone;
    } finally {
      this.state.operations.isExecuting = false;
    }
  }

  /**
   * Redo the last undone command
   */
  async redo(): Promise<boolean> {
    if (!this.history.canRedo) {
      return false;
    }

    try {
      this.state.operations.isExecuting = true;
      const redone = await this.history.redo();
      return redone;
    } finally {
      this.state.operations.isExecuting = false;
    }
  }

  /**
   * Clear the entire history
   */
  clearHistory(): void {
    this.history.clear();
    this.state.operations.lastUndoableCommandId = null;
  }

  /**
   * Get the history manager for advanced use cases
   */
  getHistory(): HistoryManager {
    return this.history;
  }

  private pushToHistory<TUndoPayload>(
    command: Command<unknown, TUndoPayload>,
    undoPayload: TUndoPayload,
    context: CommandContext,
    options: { historyLabel?: string; coalesceKey?: string }
  ): boolean {
    try {
      // Store the command and undo payload for later use
      const storedCommand = command;
      const storedUndoPayload = undoPayload;
      const beforeSnapshot = context.snapshot;

      const historyEntry: HistoryEntryInit = {
        metadata: {
          commandId: command.metadata.id,
          label: options.historyLabel ?? command.metadata.title,
          description: command.metadata.description,
          coalesceKey: options.coalesceKey,
        },
        undo: async () => {
          // Create a fresh context for undo operation
          const undoContext = createCommandContext(this.state, getAppStateSnapshot());
          
          // Call the command's undo method if it exists
          if ('undo' in storedCommand && typeof (storedCommand as any).undo === 'function') {
            await (storedCommand as any).undo(undoContext, storedUndoPayload);
          } else {
            console.warn(
              `Command ${storedCommand.metadata.id} does not implement undo method but returned undo payload`
            );
          }
        },
        redo: async () => {
          // Create a fresh context for redo operation
          const redoContext = createCommandContext(this.state, getAppStateSnapshot());
          
          // Call the command's redo method if it exists, otherwise re-execute
          if ('redo' in storedCommand && typeof (storedCommand as any).redo === 'function') {
            await (storedCommand as any).redo(redoContext);
          } else {
            // Default redo: re-execute the command
            await storedCommand.execute(redoContext);
          }
        },
        beforeSnapshot: beforeSnapshot,
      };

      this.history.push(historyEntry);
      return true;
    } catch (error) {
      console.error('[CommandDispatcherService] Failed to push command to history', error);
      return false;
    }
  }
}

/**
 * Convenience function to get the CommandDispatcherService instance
 */
export const resolveCommandDispatcher = (): CommandDispatcherService => {
  const { ServiceContainer } = require('@/fw/di');
  return ServiceContainer.getInstance().getService(
    ServiceContainer.getInstance().getOrCreateToken(CommandDispatcherService)
  ) as CommandDispatcherService;
};
