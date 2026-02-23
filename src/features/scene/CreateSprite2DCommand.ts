import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateSprite2DOperation,
  type CreateSprite2DOperationParams,
} from '@/features/scene/CreateSprite2DOperation';

export interface CreateSprite2DCommandPayload extends CreateNodeCommandPayload {}

export class CreateSprite2DCommand extends CreateNodeBaseCommand<
  CreateSprite2DOperationParams,
  CreateSprite2DCommandPayload
> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-sprite2d',
    title: 'Create Sprite2D',
    description: 'Create a new 2D sprite in the scene',
    keywords: ['create', 'sprite', '2d', 'image', 'add'],
  };

  constructor(params: CreateSprite2DOperationParams = {}) {
    super(
      params,
      operationParams => new CreateSprite2DOperation(operationParams),
      'An active scene is required to create a Sprite2D'
    );
  }
}
