import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateLabel2DOperation,
  type CreateLabel2DOperationParams,
} from '@/features/scene/CreateLabel2DOperation';

export interface CreateLabel2DCommandPayload extends CreateNodeCommandPayload {}

export class CreateLabel2DCommand extends CreateNodeBaseCommand<CreateLabel2DOperationParams, CreateLabel2DCommandPayload> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-label2d',
    title: 'Create Label2D',
    description: 'Create a new 2D label in the scene',
    keywords: ['create', 'label', 'text', '2d', 'ui', 'add'],
  };

  constructor(params: CreateLabel2DOperationParams = {}) {
    super(
      params,
      operationParams => new CreateLabel2DOperation(operationParams),
      'An active scene is required to create a Label2D'
    );
  }
}
