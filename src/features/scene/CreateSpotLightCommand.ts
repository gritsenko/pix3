import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateSpotLightOperation,
  type CreateSpotLightOperationParams,
} from '@/features/scene/CreateSpotLightOperation';

export interface CreateSpotLightCommandPayload extends CreateNodeCommandPayload {}

export class CreateSpotLightCommand extends CreateNodeBaseCommand<
  CreateSpotLightOperationParams,
  CreateSpotLightCommandPayload
> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-spot-light',
    title: 'Create Spot Light',
    description: 'Create a new spot light in the scene',
    keywords: ['create', 'light', 'spot', '3d', 'add'],
  };

  constructor(params: CreateSpotLightOperationParams = {}) {
    super(
      params,
      operationParams => new CreateSpotLightOperation(operationParams),
      'An active scene is required to create a spot light'
    );
  }
}
