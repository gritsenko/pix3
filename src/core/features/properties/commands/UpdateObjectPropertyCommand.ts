import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/commands/command';
import { OperationService } from '@/core/operations/OperationService';
import {
  UpdateObjectPropertyOperation,
  type UpdateObjectPropertyParams,
} from '@/core/features/properties/operations/UpdateObjectPropertyOperation';
import { SceneManager } from '@/core/scene/SceneManager';

export interface UpdateObjectPropertyExecutePayload {}

export class UpdateObjectPropertyCommand extends CommandBase<
  UpdateObjectPropertyExecutePayload,
  void
> {
  readonly metadata: CommandMetadata = {
    id: 'scene.update-object-property',
    title: 'Update Object Property',
    description: 'Update a property on a scene object',
    keywords: ['update', 'property', 'object', 'node', 'transform'],
  };

  private readonly params: UpdateObjectPropertyParams;

  constructor(params: UpdateObjectPropertyParams) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    const sceneManager = context.container.getService<SceneManager>(
      context.container.getOrCreateToken(SceneManager)
    );
    return { canExecute: Boolean(sceneManager.getActiveSceneGraph()) };
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<UpdateObjectPropertyExecutePayload>> {
    const operations = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const op = new UpdateObjectPropertyOperation(this.params);
    const pushed = await operations.invokeAndPush(op);
    return { didMutate: pushed, payload: {} };
  }
}
