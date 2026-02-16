import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateBoxOperation,
  type CreateBoxOperationParams,
} from '@/features/scene/CreateBoxOperation';
import {
  getCreatedNodeIdFromSelection,
  requireActiveScene,
} from '@/features/scene/scene-command-utils';

export interface CreateBoxCommandPayload {
  nodeId: string;
}

export class CreateBoxCommand extends CommandBase<CreateBoxCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-box',
    title: 'Create Box',
    description: 'Create a new box geometry mesh in the scene',
    keywords: ['create', 'box', 'geometry', 'mesh', 'add'],
  };

  private readonly params: CreateBoxOperationParams;

  constructor(params: CreateBoxOperationParams = {}) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    return requireActiveScene(context, 'An active scene is required to create a box');
  }

  async execute(context: CommandContext): Promise<CommandExecutionResult<CreateBoxCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );

    const op = new CreateBoxOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);
    const nodeId = getCreatedNodeIdFromSelection(context, pushed);

    return { didMutate: pushed, payload: { nodeId } };
  }
}
