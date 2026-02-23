import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateBoxOperation,
  type CreateBoxOperationParams,
} from '@/features/scene/CreateBoxOperation';

export interface CreateBoxCommandPayload extends CreateNodeCommandPayload {}

export class CreateBoxCommand extends CreateNodeBaseCommand<CreateBoxOperationParams, CreateBoxCommandPayload> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-box',
    title: 'Create Box',
    description: 'Create a new box geometry mesh in the scene',
    keywords: ['create', 'box', 'geometry', 'mesh', 'add'],
  };

  constructor(params: CreateBoxOperationParams = {}) {
    super(
      params,
      operationParams => new CreateBoxOperation(operationParams),
      'An active scene is required to create a box'
    );
  }
}
