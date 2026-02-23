import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateBar2DOperation,
  type CreateBar2DOperationParams,
} from '@/features/scene/CreateBar2DOperation';

export interface CreateBar2DCommandPayload extends CreateNodeCommandPayload {}

export class CreateBar2DCommand extends CreateNodeBaseCommand<CreateBar2DOperationParams, CreateBar2DCommandPayload> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-bar2d',
    title: 'Create Bar2D',
    description: 'Create a new 2D bar in the scene',
    keywords: ['create', 'bar', '2d', 'ui', 'progress', 'hp', 'add'],
  };

  constructor(params: CreateBar2DOperationParams = {}) {
    super(
      params,
      operationParams => new CreateBar2DOperation(operationParams),
      'An active scene is required to create a Bar2D'
    );
  }
}
