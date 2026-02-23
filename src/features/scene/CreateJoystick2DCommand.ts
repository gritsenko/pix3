import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateJoystick2DOperation,
  type CreateJoystick2DOperationParams,
} from '@/features/scene/CreateJoystick2DOperation';

export interface CreateJoystick2DCommandPayload extends CreateNodeCommandPayload {}

export class CreateJoystick2DCommand extends CreateNodeBaseCommand<CreateJoystick2DOperationParams, CreateJoystick2DCommandPayload> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-joystick2d',
    title: 'Create Joystick2D',
    description: 'Create a new 2D joystick in the scene',
    keywords: ['create', 'joystick', '2d', 'input', 'add'],
  };

  constructor(params: CreateJoystick2DOperationParams = {}) {
    super(
      params,
      operationParams => new CreateJoystick2DOperation(operationParams),
      'An active scene is required to create a Joystick2D'
    );
  }
}
