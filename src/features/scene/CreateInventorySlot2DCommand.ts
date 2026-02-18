import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateInventorySlot2DOperation,
  type CreateInventorySlot2DOperationParams,
} from '@/features/scene/CreateInventorySlot2DOperation';
import {
  getCreatedNodeIdFromSelection,
  requireActiveScene,
} from '@/features/scene/scene-command-utils';

export interface CreateInventorySlot2DCommandPayload {
  nodeId: string;
}

export class CreateInventorySlot2DCommand extends CommandBase<CreateInventorySlot2DCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-inventoryslot2d',
    title: 'Create InventorySlot2D',
    description: 'Create a new 2D inventory slot in the scene',
    keywords: ['create', 'inventory', 'slot', '2d', 'ui', 'item', 'add'],
  };

  private readonly params: CreateInventorySlot2DOperationParams;

  constructor(params: CreateInventorySlot2DOperationParams = {}) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    return requireActiveScene(context, 'An active scene is required to create an InventorySlot2D');
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateInventorySlot2DCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );

    const op = new CreateInventorySlot2DOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);
    const nodeId = getCreatedNodeIdFromSelection(context, pushed);

    return {
      didMutate: pushed,
      payload: { nodeId },
    };
  }
}
