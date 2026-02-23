import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreatePointLightOperation,
  type CreatePointLightOperationParams,
} from '@/features/scene/CreatePointLightOperation';

export interface CreatePointLightCommandPayload extends CreateNodeCommandPayload {}

export class CreatePointLightCommand extends CreateNodeBaseCommand<
  CreatePointLightOperationParams,
  CreatePointLightCommandPayload
> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-point-light',
    title: 'Create Point Light',
    description: 'Create a new point light in the scene',
    keywords: ['create', 'light', 'point', '3d', 'add'],
  };

  constructor(params: CreatePointLightOperationParams = {}) {
    super(
      params,
      operationParams => new CreatePointLightOperation(operationParams),
      'An active scene is required to create a point light'
    );
  }
}
