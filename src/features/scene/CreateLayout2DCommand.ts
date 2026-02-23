import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateLayout2DOperation,
  type CreateLayout2DOperationParams,
} from '@/features/scene/CreateLayout2DOperation';

export interface CreateLayout2DCommandPayload extends CreateNodeCommandPayload {}

export class CreateLayout2DCommand extends CreateNodeBaseCommand<CreateLayout2DOperationParams, CreateLayout2DCommandPayload> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-layout2d',
    title: 'Create Layout2D',
    description: 'Create a new Layout2D root node',
    keywords: ['create', 'layout2d', 'viewport', 'container', 'root'],
  };

  constructor(params: CreateLayout2DOperationParams = {}) {
    super(
      params,
      operationParams => new CreateLayout2DOperation(operationParams),
      'An active scene is required to create a Layout2D'
    );
  }
}
