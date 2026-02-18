import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateButton2DOperation,
  type CreateButton2DOperationParams,
} from '@/features/scene/CreateButton2DOperation';
import {
  getCreatedNodeIdFromSelection,
  requireActiveScene,
} from '@/features/scene/scene-command-utils';

export interface CreateButton2DCommandPayload {
  nodeId: string;
}

export class CreateButton2DCommand extends CommandBase<CreateButton2DCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-button2d',
    title: 'Create Button2D',
    description: 'Create a new 2D button in the scene',
    keywords: ['create', 'button', '2d', 'ui', 'add'],
  };

  private readonly params: CreateButton2DOperationParams;

  constructor(params: CreateButton2DOperationParams = {}) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    return requireActiveScene(context, 'An active scene is required to create a Button2D');
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateButton2DCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );

    const op = new CreateButton2DOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);
    const nodeId = getCreatedNodeIdFromSelection(context, pushed);

    return {
      didMutate: pushed,
      payload: { nodeId },
    };
  }
}
