/**
 * RemoveComponentCommand - Command to remove a component from a node
 */

import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import { RemoveComponentOperation, type RemoveComponentParams } from './RemoveComponentOperation';

export class RemoveComponentCommand extends CommandBase<object, void> {
  readonly metadata: CommandMetadata = {
    id: 'scripts.remove-component',
    title: 'Remove Component',
    description: 'Remove a script component from a node',
    keywords: ['remove', 'component', 'script'],
  };

  private readonly params: RemoveComponentParams;

  constructor(params: RemoveComponentParams) {
    super();
    this.params = params;
  }

  async execute(context: CommandContext): Promise<CommandExecutionResult<object>> {
    const operations = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const op = new RemoveComponentOperation(this.params);
    const pushed = await operations.invokeAndPush(op);
    return { didMutate: pushed, payload: {} };
  }
}
