import {
  CommandBase,
  type CommandContext,
  type CommandExecutionResult,
  type CommandMetadata,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateSprite3DOperation,
  type CreateSprite3DOperationParams,
} from '@/features/scene/CreateSprite3DOperation';
import {
  getCreatedNodeIdFromSelection,
  requireActiveScene,
} from '@/features/scene/scene-command-utils';

export interface CreateSprite3DCommandPayload {
  nodeId: string;
}

export class CreateSprite3DCommand extends CommandBase<CreateSprite3DCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-sprite3d',
    title: 'Create Sprite3D',
    description: 'Create a new 3D sprite in the scene',
    keywords: ['create', 'sprite', '3d', 'image', 'billboard', 'marker', 'add'],
  };

  private readonly params: CreateSprite3DOperationParams;

  constructor(params: CreateSprite3DOperationParams = {}) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    return requireActiveScene(context, 'An active scene is required to create a Sprite3D');
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateSprite3DCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );

    const op = new CreateSprite3DOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);
    const nodeId = getCreatedNodeIdFromSelection(context, pushed);

    return { didMutate: pushed, payload: { nodeId } };
  }
}
