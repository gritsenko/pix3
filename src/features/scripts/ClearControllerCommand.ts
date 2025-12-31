/**
 * ClearControllerCommand - Command to remove a controller from a node
 */

import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  ClearControllerOperation,
  type ClearControllerParams,
} from './ClearControllerOperation';

export class ClearControllerCommand extends CommandBase<object, void> {
  readonly metadata: CommandMetadata = {
    id: 'scripts.clear-controller',
    title: 'Clear Controller',
    description: 'Remove a controller script from a node',
    keywords: ['clear', 'remove', 'controller', 'script'],
  };

  private readonly params: ClearControllerParams;

  constructor(params: ClearControllerParams) {
    super();
    this.params = params;
  }

  async execute(context: CommandContext): Promise<CommandExecutionResult<object>> {
    const operations = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const op = new ClearControllerOperation(this.params);
    const pushed = await operations.invokeAndPush(op);
    return { didMutate: pushed, payload: {} };
  }
}
