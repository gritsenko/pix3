import { type CommandMetadata } from '@/core/command';
import {
  CreateNodeBaseCommand,
  type CreateNodeCommandPayload,
} from '@/features/scene/CreateNodeBaseCommand';
import {
  CreatePrefabInstanceOperation,
  type CreatePrefabInstanceOperationParams,
} from '@/features/scene/CreatePrefabInstanceOperation';

export interface CreatePrefabInstanceCommandPayload extends CreateNodeCommandPayload {}

export class CreatePrefabInstanceCommand extends CreateNodeBaseCommand<
  CreatePrefabInstanceOperationParams,
  CreatePrefabInstanceCommandPayload
> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-prefab-instance',
    title: 'Create Prefab Instance',
    description: 'Instantiate a prefab scene asset in the active scene',
    keywords: ['prefab', 'instance', 'scene', 'create', 'drag-drop'],
    menuPath: 'insert',
    addToMenu: true,
  };

  constructor(params: CreatePrefabInstanceOperationParams) {
    super(
      params,
      operationParams => new CreatePrefabInstanceOperation(operationParams),
      'An active scene is required to create a prefab instance'
    );
  }
}
