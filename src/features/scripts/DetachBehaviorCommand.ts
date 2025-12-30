/**
 * DetachBehaviorCommand - Command to detach a behavior from a node
 */

import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import { DetachBehaviorOperation, type DetachBehaviorParams } from './DetachBehaviorOperation';

export class DetachBehaviorCommand extends CommandBase<object, void> {
  readonly metadata: CommandMetadata = {
    id: 'scripts.detach-behavior',
    title: 'Detach Behavior',
    description: 'Detach a behavior from a node',
    keywords: ['detach', 'behavior', 'script', 'remove'],
  };

  private readonly params: DetachBehaviorParams;

  constructor(params: DetachBehaviorParams) {
    super();
    this.params = params;
  }

  async execute(context: CommandContext): Promise<CommandExecutionResult<object>> {
    const operations = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const op = new DetachBehaviorOperation(this.params);
    const pushed = await operations.invokeAndPush(op);
    return { didMutate: pushed, payload: {} };
  }
}
