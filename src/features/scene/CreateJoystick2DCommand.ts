import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateJoystick2DOperation,
  type CreateJoystick2DOperationParams,
} from '@/features/scene/CreateJoystick2DOperation';
import {
  getCreatedNodeIdFromSelection,
  requireActiveScene,
} from '@/features/scene/scene-command-utils';

export interface CreateJoystick2DCommandPayload {
  nodeId: string;
}

export class CreateJoystick2DCommand extends CommandBase<CreateJoystick2DCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-joystick2d',
    title: 'Create Joystick2D',
    description: 'Create a new 2D joystick in the scene',
    keywords: ['create', 'joystick', '2d', 'input', 'add'],
  };

  private readonly params: CreateJoystick2DOperationParams;

  constructor(params: CreateJoystick2DOperationParams = {}) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    return requireActiveScene(context, 'An active scene is required to create a Joystick2D');
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateJoystick2DCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );

    const op = new CreateJoystick2DOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);
    const nodeId = getCreatedNodeIdFromSelection(context, pushed);

    return { didMutate: pushed, payload: { nodeId } };
  }
}
