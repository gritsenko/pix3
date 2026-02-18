import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateLabel2DOperation,
  type CreateLabel2DOperationParams,
} from '@/features/scene/CreateLabel2DOperation';
import {
  getCreatedNodeIdFromSelection,
  requireActiveScene,
} from '@/features/scene/scene-command-utils';

export interface CreateLabel2DCommandPayload {
  nodeId: string;
}

export class CreateLabel2DCommand extends CommandBase<CreateLabel2DCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-label2d',
    title: 'Create Label2D',
    description: 'Create a new 2D label in the scene',
    keywords: ['create', 'label', 'text', '2d', 'ui', 'add'],
  };

  private readonly params: CreateLabel2DOperationParams;

  constructor(params: CreateLabel2DOperationParams = {}) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    return requireActiveScene(context, 'An active scene is required to create a Label2D');
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateLabel2DCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );

    const op = new CreateLabel2DOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);
    const nodeId = getCreatedNodeIdFromSelection(context, pushed);

    return {
      didMutate: pushed,
      payload: { nodeId },
    };
  }
}
