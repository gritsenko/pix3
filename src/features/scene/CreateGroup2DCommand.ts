import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateGroup2DOperation,
  type CreateGroup2DOperationParams,
} from '@/features/scene/CreateGroup2DOperation';
import {
  getCreatedNodeIdFromSelection,
  requireActiveScene,
} from '@/features/scene/scene-command-utils';

export interface CreateGroup2DCommandPayload {
  nodeId: string;
}

export class CreateGroup2DCommand extends CommandBase<CreateGroup2DCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-group2d',
    title: 'Create Group2D',
    description: 'Create a new 2D group container in the scene',
    keywords: ['create', 'group', '2d', 'container', 'add'],
  };

  private readonly params: CreateGroup2DOperationParams;

  constructor(params: CreateGroup2DOperationParams = {}) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    return requireActiveScene(context, 'An active scene is required to create a Group2D');
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateGroup2DCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );

    const op = new CreateGroup2DOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);
    const nodeId = getCreatedNodeIdFromSelection(context, pushed);

    return { didMutate: pushed, payload: { nodeId } };
  }
}
