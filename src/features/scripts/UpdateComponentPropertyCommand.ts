import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
  type CommandPreconditionResult,
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

  preconditions(context: CommandContext): CommandPreconditionResult {
    if (!context.snapshot.scenes.activeSceneId) {
      return { canExecute: false, reason: 'No active scene', scope: 'scene' };
    }
    if (!this.params.nodeId) {
      return { canExecute: false, reason: 'No target node specified', scope: 'selection' };
    }
    return { canExecute: true };
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
