import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateSlider2DOperation,
  type CreateSlider2DOperationParams,
} from '@/features/scene/CreateSlider2DOperation';
import {
  getCreatedNodeIdFromSelection,
  requireActiveScene,
} from '@/features/scene/scene-command-utils';

export interface CreateSlider2DCommandPayload {
  nodeId: string;
}

export class CreateSlider2DCommand extends CommandBase<CreateSlider2DCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-slider2d',
    title: 'Create Slider2D',
    description: 'Create a new 2D slider in the scene',
    keywords: ['create', 'slider', '2d', 'ui', 'add'],
  };

  private readonly params: CreateSlider2DOperationParams;

  constructor(params: CreateSlider2DOperationParams = {}) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    return requireActiveScene(context, 'An active scene is required to create a Slider2D');
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateSlider2DCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );

    const op = new CreateSlider2DOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);
    const nodeId = getCreatedNodeIdFromSelection(context, pushed);

    return {
      didMutate: pushed,
      payload: { nodeId },
    };
  }
}
