import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateCheckbox2DOperation,
  type CreateCheckbox2DOperationParams,
} from '@/features/scene/CreateCheckbox2DOperation';

export interface CreateCheckbox2DCommandPayload extends CreateNodeCommandPayload {}

export class CreateCheckbox2DCommand extends CreateNodeBaseCommand<CreateCheckbox2DOperationParams, CreateCheckbox2DCommandPayload> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-checkbox2d',
    title: 'Create Checkbox2D',
    description: 'Create a new 2D checkbox in the scene',
    keywords: ['create', 'checkbox', '2d', 'ui', 'toggle', 'add'],
  };

  constructor(params: CreateCheckbox2DOperationParams = {}) {
    super(
      params,
      operationParams => new CreateCheckbox2DOperation(operationParams),
      'An active scene is required to create a Checkbox2D'
    );
  }
}
