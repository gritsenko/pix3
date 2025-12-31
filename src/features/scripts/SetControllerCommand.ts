import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import { SetControllerOperation, type SetControllerParams } from './SetControllerOperation';

export class SetControllerCommand extends CommandBase<object, void> {
  readonly metadata: CommandMetadata = {
    id: 'scripts.set-controller',
    title: 'Set Controller',
    description: 'Set a controller script for a node',
    keywords: ['set', 'controller', 'script'],
  };

  private readonly params: SetControllerParams;

  constructor(params: SetControllerParams) {
    super();
    this.params = params;
  }

  async execute(context: CommandContext): Promise<CommandExecutionResult<object>> {
    const operations = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const op = new SetControllerOperation(this.params);
    const pushed = await operations.invokeAndPush(op);
    return { didMutate: pushed, payload: {} };
  }
}
