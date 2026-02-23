import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateInventorySlot2DOperation,
  type CreateInventorySlot2DOperationParams,
} from '@/features/scene/CreateInventorySlot2DOperation';

export interface CreateInventorySlot2DCommandPayload extends CreateNodeCommandPayload {}

export class CreateInventorySlot2DCommand extends CreateNodeBaseCommand<CreateInventorySlot2DOperationParams, CreateInventorySlot2DCommandPayload> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-inventoryslot2d',
    title: 'Create InventorySlot2D',
    description: 'Create a new 2D inventory slot in the scene',
    keywords: ['create', 'inventory', 'slot', '2d', 'ui', 'item', 'add'],
  };

  constructor(params: CreateInventorySlot2DOperationParams = {}) {
    super(
      params,
      operationParams => new CreateInventorySlot2DOperation(operationParams),
      'An active scene is required to create an InventorySlot2D'
    );
  }
}
