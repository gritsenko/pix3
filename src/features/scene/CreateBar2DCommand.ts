import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateBar2DOperation,
  type CreateBar2DOperationParams,
} from '@/features/scene/CreateBar2DOperation';
import {
  getCreatedNodeIdFromSelection,
  requireActiveScene,
} from '@/features/scene/scene-command-utils';

export interface CreateBar2DCommandPayload {
  nodeId: string;
}

export class CreateBar2DCommand extends CommandBase<CreateBar2DCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-bar2d',
    title: 'Create Bar2D',
    description: 'Create a new 2D bar in the scene',
    keywords: ['create', 'bar', '2d', 'ui', 'progress', 'hp', 'add'],
  };

  private readonly params: CreateBar2DOperationParams;

  constructor(params: CreateBar2DOperationParams = {}) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    return requireActiveScene(context, 'An active scene is required to create a Bar2D');
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateBar2DCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );

    const op = new CreateBar2DOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);
    const nodeId = getCreatedNodeIdFromSelection(context, pushed);

    return {
      didMutate: pushed,
      payload: { nodeId },
    };
  }
}
