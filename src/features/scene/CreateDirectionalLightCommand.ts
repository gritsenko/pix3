import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateDirectionalLightOperation,
  type CreateDirectionalLightOperationParams,
} from '@/features/scene/CreateDirectionalLightOperation';
import {
  getCreatedNodeIdFromSelection,
  requireActiveScene,
} from '@/features/scene/scene-command-utils';

export interface CreateDirectionalLightCommandPayload {
  nodeId: string;
}

export class CreateDirectionalLightCommand extends CommandBase<
  CreateDirectionalLightCommandPayload,
  void
> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-directional-light',
    title: 'Create Directional Light',
    description: 'Create a new directional light in the scene',
    keywords: ['create', 'light', 'directional', '3d', 'add'],
  };

  private readonly params: CreateDirectionalLightOperationParams;

  constructor(params: CreateDirectionalLightOperationParams = {}) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    return requireActiveScene(context, 'An active scene is required to create a directional light');
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateDirectionalLightCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );

    const op = new CreateDirectionalLightOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);
    const nodeId = getCreatedNodeIdFromSelection(context, pushed);

    return { didMutate: pushed, payload: { nodeId } };
  }
}
