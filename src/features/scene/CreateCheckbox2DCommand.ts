import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateCheckbox2DOperation,
  type CreateCheckbox2DOperationParams,
} from '@/features/scene/CreateCheckbox2DOperation';
import {
  getCreatedNodeIdFromSelection,
  requireActiveScene,
} from '@/features/scene/scene-command-utils';

export interface CreateCheckbox2DCommandPayload {
  nodeId: string;
}

export class CreateCheckbox2DCommand extends CommandBase<CreateCheckbox2DCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-checkbox2d',
    title: 'Create Checkbox2D',
    description: 'Create a new 2D checkbox in the scene',
    keywords: ['create', 'checkbox', '2d', 'ui', 'toggle', 'add'],
  };

  private readonly params: CreateCheckbox2DOperationParams;

  constructor(params: CreateCheckbox2DOperationParams = {}) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    return requireActiveScene(context, 'An active scene is required to create a Checkbox2D');
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateCheckbox2DCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );

    const op = new CreateCheckbox2DOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);
    const nodeId = getCreatedNodeIdFromSelection(context, pushed);

    return {
      didMutate: pushed,
      payload: { nodeId },
    };
  }
}
