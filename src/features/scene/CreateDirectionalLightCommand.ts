import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateDirectionalLightOperation,
  type CreateDirectionalLightOperationParams,
} from '@/features/scene/CreateDirectionalLightOperation';

export interface CreateDirectionalLightCommandPayload extends CreateNodeCommandPayload {}

export class CreateDirectionalLightCommand extends CreateNodeBaseCommand<CreateDirectionalLightOperationParams, CreateDirectionalLightCommandPayload> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-directional-light',
    title: 'Create Directional Light',
    description: 'Create a new directional light in the scene',
    keywords: ['create', 'light', 'directional', '3d', 'add'],
  };

  constructor(params: CreateDirectionalLightOperationParams = {}) {
    super(
      params,
      operationParams => new CreateDirectionalLightOperation(operationParams),
      'An active scene is required to create a directional light'
    );
  }
}
