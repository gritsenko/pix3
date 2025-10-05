import type {
  Command,
  CommandContext,
  CommandExecutionResult,
  CommandUndoPayload,
} from './command';
import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/operations/Operation';

/**
 * Adapter that wraps a Command to work as an Operation.
 * This allows Commands to be executed through OperationService with full undo/redo support.
 */
export class CommandOperationAdapter<TExecutePayload = void, TUndoPayload = void>
  implements Operation<OperationInvokeResult>
{
  readonly metadata: OperationMetadata;
  private readonly command: Command<TExecutePayload, TUndoPayload>;

  constructor(command: Command<TExecutePayload, TUndoPayload>) {
    this.command = command;
    this.metadata = {
      id: command.metadata.id,
      title: command.metadata.title,
      description: command.metadata.description,
    };
  }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    // Check preconditions first
    if (this.command.preconditions) {
      const preconditionResult = await Promise.resolve(
        this.command.preconditions(context as CommandContext)
      );
      if (!preconditionResult.canExecute) {
        return {
          didMutate: false,
        };
      }
    }

    // Execute the command
    const executionResult: CommandExecutionResult<TExecutePayload> = await Promise.resolve(
      this.command.execute(context as CommandContext)
    );

    // If command didn't mutate, return early
    if (!executionResult.didMutate) {
      return {
        didMutate: false,
      };
    }

    // Get undo payload from postCommit
    let undoPayload: CommandUndoPayload<TUndoPayload> | undefined;
    if (this.command.postCommit) {
      undoPayload = await Promise.resolve(
        this.command.postCommit(context as CommandContext, executionResult.payload)
      );
    }

    // If no undo payload, command is not undoable
    if (undoPayload === undefined) {
      return {
        didMutate: true,
      };
    }

    // Check if command has undo/redo methods
    const hasUndo = 'undo' in this.command && typeof (this.command as any).undo === 'function';
    const hasRedo = 'redo' in this.command && typeof (this.command as any).redo === 'function';

    if (!hasUndo) {
      console.warn(
        `Command ${this.command.metadata.id} returned undo payload but doesn't implement undo() method`
      );
      return {
        didMutate: true,
      };
    }

    // Create undo/redo commit
    return {
      didMutate: true,
      commit: {
        label: this.command.metadata.title,
        beforeSnapshot: context.snapshot,
        undo: async () => {
          // Call the command's undo method with the stored payload
          await (this.command as any).undo(context, undoPayload);
        },
        redo: async () => {
          // Call the command's redo method if it exists, otherwise re-execute
          if (hasRedo) {
            await (this.command as any).redo(context);
          } else {
            await this.command.execute(context as CommandContext);
          }
        },
      },
    };
  }
}

/**
 * Convenience function to wrap a Command as an Operation
 */
export const wrapCommand = <TExecutePayload = void, TUndoPayload = void>(
  command: Command<TExecutePayload, TUndoPayload>
): Operation<OperationInvokeResult> => {
  return new CommandOperationAdapter(command);
};
