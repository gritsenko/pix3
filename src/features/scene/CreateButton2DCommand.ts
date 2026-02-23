import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateButton2DOperation,
  type CreateButton2DOperationParams,
} from '@/features/scene/CreateButton2DOperation';

export interface CreateButton2DCommandPayload extends CreateNodeCommandPayload {}

export class CreateButton2DCommand extends CreateNodeBaseCommand<CreateButton2DOperationParams, CreateButton2DCommandPayload> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-button2d',
    title: 'Create Button2D',
    description: 'Create a new 2D button in the scene',
    keywords: ['create', 'button', '2d', 'ui', 'add'],
  };

  constructor(params: CreateButton2DOperationParams = {}) {
    super(
      params,
      operationParams => new CreateButton2DOperation(operationParams),
      'An active scene is required to create a Button2D'
    );
  }
}
