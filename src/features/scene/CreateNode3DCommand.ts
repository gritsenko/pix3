import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateNode3DOperation,
  type CreateNode3DOperationParams,
} from '@/features/scene/CreateNode3DOperation';

export interface CreateNode3DCommandPayload extends CreateNodeCommandPayload {}

export class CreateNode3DCommand extends CreateNodeBaseCommand<CreateNode3DOperationParams, CreateNode3DCommandPayload> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-node3d',
    title: 'Create Node3D',
    description: 'Create an empty 3D node container for grouping',
    keywords: ['create', 'node3d', 'empty', '3d', 'group', 'add'],
  };

  constructor(params: CreateNode3DOperationParams = {}) {
    super(
      params,
      operationParams => new CreateNode3DOperation(operationParams),
      'An active scene is required to create a Node3D'
    );
  }
}
