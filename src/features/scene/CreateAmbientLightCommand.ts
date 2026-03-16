import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateAmbientLightOperation,
  type CreateAmbientLightOperationParams,
} from '@/features/scene/CreateAmbientLightOperation';

export type CreateAmbientLightCommandPayload = CreateNodeCommandPayload;

export class CreateAmbientLightCommand extends CreateNodeBaseCommand<
  CreateAmbientLightOperationParams,
  CreateAmbientLightCommandPayload
> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-ambient-light',
    title: 'Create Ambient Light',
    description: 'Create a new ambient light in the scene',
    keywords: ['create', 'light', 'ambient', '3d', 'add', 'global'],
  };

  constructor(params: CreateAmbientLightOperationParams = {}) {
    super(
      params,
      operationParams => new CreateAmbientLightOperation(operationParams),
      'An active scene is required to create an ambient light'
    );
  }
}
