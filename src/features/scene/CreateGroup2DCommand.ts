import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateGroup2DOperation,
  type CreateGroup2DOperationParams,
} from '@/features/scene/CreateGroup2DOperation';

export interface CreateGroup2DCommandPayload extends CreateNodeCommandPayload {}

export class CreateGroup2DCommand extends CreateNodeBaseCommand<CreateGroup2DOperationParams, CreateGroup2DCommandPayload> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-group2d',
    title: 'Create Group2D',
    description: 'Create a new 2D group container in the scene',
    keywords: ['create', 'group', '2d', 'container', 'add'],
  };

  constructor(params: CreateGroup2DOperationParams = {}) {
    super(
      params,
      operationParams => new CreateGroup2DOperation(operationParams),
      'An active scene is required to create a Group2D'
    );
  }
}
