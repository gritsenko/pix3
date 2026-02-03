import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  UpdateLayout2DSizeOperation,
  type UpdateLayout2DSizeOperationParams,
} from '@/features/scene/UpdateLayout2DSizeOperation';

export class UpdateLayout2DSizeCommand extends CommandBase<
  UpdateLayout2DSizeOperationParams,
  void
> {
  readonly metadata: CommandMetadata = {
    id: 'scene.update-layout2d-size',
    title: 'Update Layout2D Size',
    description: 'Update Layout2D viewport dimensions',
    keywords: ['update', 'layout2d', 'viewport', 'size', 'resolution'],
  };

  private readonly params: UpdateLayout2DSizeOperationParams;

  constructor(params: UpdateLayout2DSizeOperationParams) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    const { state } = context;
    const node = state.selection.primaryNodeId;

    if (!node) {
      return {
        canExecute: false,
        reason: 'A Layout2D node must be selected',
        scope: 'selection' as const,
      };
    }

    return { canExecute: true };
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<UpdateLayout2DSizeOperationParams>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );

    const op = new UpdateLayout2DSizeOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);

    return { didMutate: pushed, payload: this.params };
  }
}
