import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateAnimatedSprite2DOperation,
  type CreateAnimatedSprite2DOperationParams,
} from '@/features/scene/CreateAnimatedSprite2DOperation';

export interface CreateAnimatedSprite2DCommandPayload extends CreateNodeCommandPayload {}

export class CreateAnimatedSprite2DCommand extends CreateNodeBaseCommand<
  CreateAnimatedSprite2DOperationParams,
  CreateAnimatedSprite2DCommandPayload
> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-animatedsprite2d',
    title: 'Create AnimatedSprite2D',
    description: 'Create a 2D animated sprite in the scene',
    menuPath: 'create/2d',
    addToMenu: true,
    menuOrder: 160,
    keywords: ['create', 'animated', 'sprite', '2d', 'ui'],
  };

  constructor(params: CreateAnimatedSprite2DOperationParams = {}) {
    super(
      params,
      operationParams => new CreateAnimatedSprite2DOperation(operationParams),
      'An active scene is required to create an AnimatedSprite2D'
    );
  }
}
