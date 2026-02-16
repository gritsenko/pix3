import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateLayout2DOperation,
  type CreateLayout2DOperationParams,
} from '@/features/scene/CreateLayout2DOperation';
import {
  getCreatedNodeIdFromSelection,
  requireActiveScene,
} from '@/features/scene/scene-command-utils';

export interface CreateLayout2DCommandPayload {
  nodeId: string;
}

export class CreateLayout2DCommand extends CommandBase<CreateLayout2DCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-layout2d',
    title: 'Create Layout2D',
    description: 'Create a new Layout2D root node',
    keywords: ['create', 'layout2d', 'viewport', 'container', 'root'],
  };

  private readonly params: CreateLayout2DOperationParams;

  constructor(params: CreateLayout2DOperationParams = {}) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    return requireActiveScene(context, 'An active scene is required to create a Layout2D');
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateLayout2DCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );

    const op = new CreateLayout2DOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);
    const nodeId = getCreatedNodeIdFromSelection(context, pushed);

    return { didMutate: pushed, payload: { nodeId } };
  }
}
