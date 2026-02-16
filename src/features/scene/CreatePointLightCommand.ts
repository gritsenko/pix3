import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreatePointLightOperation,
  type CreatePointLightOperationParams,
} from '@/features/scene/CreatePointLightOperation';
import {
  getCreatedNodeIdFromSelection,
  requireActiveScene,
} from '@/features/scene/scene-command-utils';

export interface CreatePointLightCommandPayload {
  nodeId: string;
}

export class CreatePointLightCommand extends CommandBase<CreatePointLightCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-point-light',
    title: 'Create Point Light',
    description: 'Create a new point light in the scene',
    keywords: ['create', 'light', 'point', '3d', 'add'],
  };

  private readonly params: CreatePointLightOperationParams;

  constructor(params: CreatePointLightOperationParams = {}) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    return requireActiveScene(context, 'An active scene is required to create a point light');
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreatePointLightCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );

    const op = new CreatePointLightOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);
    const nodeId = getCreatedNodeIdFromSelection(context, pushed);

    return { didMutate: pushed, payload: { nodeId } };
  }
}
