import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateSlider2DOperation,
  type CreateSlider2DOperationParams,
} from '@/features/scene/CreateSlider2DOperation';

export interface CreateSlider2DCommandPayload extends CreateNodeCommandPayload {}

export class CreateSlider2DCommand extends CreateNodeBaseCommand<
  CreateSlider2DOperationParams,
  CreateSlider2DCommandPayload
> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-slider2d',
    title: 'Create Slider2D',
    description: 'Create a new 2D slider in the scene',
    keywords: ['create', 'slider', '2d', 'ui', 'add'],
  };

  constructor(params: CreateSlider2DOperationParams = {}) {
    super(
      params,
      operationParams => new CreateSlider2DOperation(operationParams),
      'An active scene is required to create a Slider2D'
    );
  }
}
