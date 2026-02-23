import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateNode3DOperation,
  type CreateNode3DOperationParams,
} from '@/features/scene/CreateNode3DOperation';
import {
  getCreatedNodeIdFromSelection,
  requireActiveScene,
} from '@/features/scene/scene-command-utils';

export interface CreateNode3DCommandPayload {
  nodeId: string;
}

export class CreateNode3DCommand extends CommandBase<CreateNode3DCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-node3d',
    title: 'Create Node3D',
    description: 'Create an empty 3D node container for grouping',
    keywords: ['create', 'node3d', 'empty', '3d', 'group', 'add'],
  };

  private readonly params: CreateNode3DOperationParams;

  constructor(params: CreateNode3DOperationParams = {}) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    return requireActiveScene(context, 'An active scene is required to create a Node3D');
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateNode3DCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );

    const op = new CreateNode3DOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);
    const nodeId = getCreatedNodeIdFromSelection(context, pushed);

    return {
      didMutate: pushed,
      payload: { nodeId },
    };
  }
}
