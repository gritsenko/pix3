import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateHemisphereLightOperation,
  type CreateHemisphereLightOperationParams,
} from '@/features/scene/CreateHemisphereLightOperation';

export interface CreateHemisphereLightCommandPayload extends CreateNodeCommandPayload {}

export class CreateHemisphereLightCommand extends CreateNodeBaseCommand<
  CreateHemisphereLightOperationParams,
  CreateHemisphereLightCommandPayload
> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-hemisphere-light',
    title: 'Create Hemisphere Light',
    description: 'Create a new hemisphere light in the scene',
    keywords: ['create', 'light', 'hemisphere', '3d', 'add', 'sky', 'global'],
  };

  constructor(params: CreateHemisphereLightOperationParams = {}) {
    super(
      params,
      operationParams => new CreateHemisphereLightOperation(operationParams),
      'An active scene is required to create a hemisphere light'
    );
  }
}
