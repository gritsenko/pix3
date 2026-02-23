import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreateMeshInstanceOperation,
  type CreateMeshInstanceOperationParams,
} from '@/features/scene/CreateMeshInstanceOperation';

export interface CreateMeshInstanceCommandPayload extends CreateNodeCommandPayload {}

export class CreateMeshInstanceCommand extends CreateNodeBaseCommand<CreateMeshInstanceOperationParams, CreateMeshInstanceCommandPayload> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-mesh-instance',
    title: 'Create Mesh Instance',
    description: 'Create a new 3D mesh instance in the scene',
    keywords: ['create', 'mesh', 'model', '3d', 'import', 'add'],
  };

  constructor(params: CreateMeshInstanceOperationParams = {}) {
    super(
      params,
      operationParams => new CreateMeshInstanceOperation(operationParams),
      'An active scene is required to create a mesh instance'
    );
  }
}
