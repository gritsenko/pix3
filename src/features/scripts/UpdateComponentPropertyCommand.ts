import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  UpdateComponentPropertyOperation,
  type UpdateComponentPropertyParams,
} from './UpdateComponentPropertyOperation';

export class UpdateComponentPropertyCommand extends CommandBase<object, void> {
  readonly metadata: CommandMetadata = {
    id: 'scripts.update-component-property',
    title: 'Update Component Property',
    description: 'Update a script component property on a node',
    keywords: ['update', 'script', 'component', 'property'],
  };

  private readonly params: UpdateComponentPropertyParams;

  constructor(params: UpdateComponentPropertyParams) {
    super();
    this.params = params;
  }

  async execute(context: CommandContext): Promise<CommandExecutionResult<object>> {
    const operations = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const op = new UpdateComponentPropertyOperation(this.params);
    const pushed = await operations.invokeAndPush(op);
    return { didMutate: pushed, payload: {} };
  }
}
