import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateSpotLightOperation,
  type CreateSpotLightOperationParams,
} from '@/features/scene/CreateSpotLightOperation';
import {
  getCreatedNodeIdFromSelection,
  requireActiveScene,
} from '@/features/scene/scene-command-utils';

export interface CreateSpotLightCommandPayload {
  nodeId: string;
}

export class CreateSpotLightCommand extends CommandBase<CreateSpotLightCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-spot-light',
    title: 'Create Spot Light',
    description: 'Create a new spot light in the scene',
    keywords: ['create', 'light', 'spot', '3d', 'add'],
  };

  private readonly params: CreateSpotLightOperationParams;

  constructor(params: CreateSpotLightOperationParams = {}) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    return requireActiveScene(context, 'An active scene is required to create a spot light');
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateSpotLightCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );

    const op = new CreateSpotLightOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);
    const nodeId = getCreatedNodeIdFromSelection(context, pushed);

    return { didMutate: pushed, payload: { nodeId } };
  }
}
