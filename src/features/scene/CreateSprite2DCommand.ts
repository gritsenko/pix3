import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateSprite2DOperation,
  type CreateSprite2DOperationParams,
} from '@/features/scene/CreateSprite2DOperation';
import {
  getCreatedNodeIdFromSelection,
  requireActiveScene,
} from '@/features/scene/scene-command-utils';

export interface CreateSprite2DCommandPayload {
  nodeId: string;
}

export class CreateSprite2DCommand extends CommandBase<CreateSprite2DCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-sprite2d',
    title: 'Create Sprite2D',
    description: 'Create a new 2D sprite in the scene',
    keywords: ['create', 'sprite', '2d', 'image', 'add'],
  };

  private readonly params: CreateSprite2DOperationParams;

  constructor(params: CreateSprite2DOperationParams = {}) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    return requireActiveScene(context, 'An active scene is required to create a Sprite2D');
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateSprite2DCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );

    const op = new CreateSprite2DOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);
    const nodeId = getCreatedNodeIdFromSelection(context, pushed);

    return { didMutate: pushed, payload: { nodeId } };
  }
}
