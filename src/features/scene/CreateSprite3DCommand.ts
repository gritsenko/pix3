import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateSprite3DOperation,
  type CreateSprite3DOperationParams,
} from '@/features/scene/CreateSprite3DOperation';

export interface CreateSprite3DCommandPayload extends CreateNodeCommandPayload {}

export class CreateSprite3DCommand extends CreateNodeBaseCommand<
  CreateSprite3DOperationParams,
  CreateSprite3DCommandPayload
> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-sprite3d',
    title: 'Create Sprite3D',
    description: 'Create a new 3D sprite in the scene',
    keywords: ['create', 'sprite', '3d', 'image', 'billboard', 'marker', 'add'],
  };

  constructor(params: CreateSprite3DOperationParams = {}) {
    super(
      params,
      operationParams => new CreateSprite3DOperation(operationParams),
      'An active scene is required to create a Sprite3D'
    );
  }
}
