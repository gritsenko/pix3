/**
 * AddComponentCommand - Command to add a component to a node
 */

import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import { AddComponentOperation, type AddComponentParams } from './AddComponentOperation';

export class AddComponentCommand extends CommandBase<object, void> {
  readonly metadata: CommandMetadata = {
    id: 'scripts.add-component',
    title: 'Add Component',
    description: 'Add a script component to a node',
    keywords: ['add', 'component', 'script'],
  };

  private readonly params: AddComponentParams;

  constructor(params: AddComponentParams) {
    super();
    this.params = params;
  }

  async execute(context: CommandContext): Promise<CommandExecutionResult<object>> {
    const operations = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const op = new AddComponentOperation(this.params);
    const pushed = await operations.invokeAndPush(op);
    return { didMutate: pushed, payload: {} };
  }
}
