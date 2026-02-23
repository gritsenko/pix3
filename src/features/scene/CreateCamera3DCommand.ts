import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateCamera3DOperation,
  type CreateCamera3DOperationParams,
} from '@/features/scene/CreateCamera3DOperation';

export interface CreateCamera3DCommandPayload extends CreateNodeCommandPayload {}

export class CreateCamera3DCommand extends CreateNodeBaseCommand<CreateCamera3DOperationParams, CreateCamera3DCommandPayload> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-camera3d',
    title: 'Create Camera3D',
    description: 'Create a new 3D camera in the scene',
    keywords: ['create', 'camera', '3d', 'viewport', 'add'],
  };

  constructor(params: CreateCamera3DOperationParams = {}) {
    super(
      params,
      operationParams => new CreateCamera3DOperation(operationParams),
      'An active scene is required to create a camera'
    );
  }
}
