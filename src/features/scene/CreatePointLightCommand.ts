import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreatePointLightOperation,
  type CreatePointLightOperationParams,
} from '@/features/scene/CreatePointLightOperation';
import { SceneManager } from '@/core/SceneManager';

export interface CreatePointLightCommandPayload {
  nodeId: string;
}

export class CreatePointLightCommand extends CommandBase<
  CreatePointLightCommandPayload,
  void
> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-point-light',
    title: 'Create Point Light',
    description: 'Create a new point light in the scene',
    keywords: ['create', 'light', 'point', '3d', 'add'],
  };

  private readonly params: CreatePointLightOperationParams;

  constructor(params: CreatePointLightOperationParams = {}) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContext) {
    const sceneManager = context.container.getService<SceneManager>(
      context.container.getOrCreateToken(SceneManager)
    );
    const hasActiveScene = Boolean(sceneManager.getActiveSceneGraph());
    if (!hasActiveScene) {
      return {
        canExecute: false,
        reason: 'An active scene is required to create a point light',
        scope: 'scene' as const,
      };
    }
    return { canExecute: true };
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreatePointLightCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const sceneManager = context.container.getService<SceneManager>(
      context.container.getOrCreateToken(SceneManager)
    );

    const op = new CreatePointLightOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);

    const activeSceneGraph = sceneManager.getActiveSceneGraph();
    const nodeId = activeSceneGraph?.rootNodes[activeSceneGraph.rootNodes.length - 1]?.nodeId || '';

    return { didMutate: pushed, payload: { nodeId } };
  }
}
