import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateMeshInstanceOperation,
  type CreateMeshInstanceOperationParams,
} from '@/features/scene/CreateMeshInstanceOperation';
import {
  getCreatedNodeIdFromSelection,
  requireActiveScene,
} from '@/features/scene/scene-command-utils';

export interface CreateMeshInstanceCommandPayload {
  nodeId: string;
}

export class CreateMeshInstanceCommand extends CommandBase<CreateMeshInstanceCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-mesh-instance',
    title: 'Create Mesh Instance',
    description: 'Create a new 3D mesh instance in the scene',
    keywords: ['create', 'mesh', 'model', '3d', 'import', 'add'],
  };

  private readonly params: CreateMeshInstanceOperationParams;

  constructor(params: CreateMeshInstanceOperationParams = {}) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    return requireActiveScene(context, 'An active scene is required to create a mesh instance');
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateMeshInstanceCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );

    const op = new CreateMeshInstanceOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);
    const nodeId = getCreatedNodeIdFromSelection(context, pushed);

    return { didMutate: pushed, payload: { nodeId } };
  }
}
