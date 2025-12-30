/**
 * AttachBehaviorCommand - Command to attach a behavior to a node
 */

import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import { AttachBehaviorOperation, type AttachBehaviorParams } from './AttachBehaviorOperation';

export class AttachBehaviorCommand extends CommandBase<object, void> {
  readonly metadata: CommandMetadata = {
    id: 'scripts.attach-behavior',
    title: 'Attach Behavior',
    description: 'Attach a behavior to a node',
    keywords: ['attach', 'behavior', 'script'],
  };

  private readonly params: AttachBehaviorParams;

  constructor(params: AttachBehaviorParams) {
    super();
    this.params = params;
  }

  async execute(context: CommandContext): Promise<CommandExecutionResult<object>> {
    const operations = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const op = new AttachBehaviorOperation(this.params);
    const pushed = await operations.invokeAndPush(op);
    return { didMutate: pushed, payload: {} };
  }
}
