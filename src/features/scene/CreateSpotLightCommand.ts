import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateSpotLightOperation,
  type CreateSpotLightOperationParams,
} from '@/features/scene/CreateSpotLightOperation';
import { SceneManager } from '@/core/SceneManager';

export interface CreateSpotLightCommandPayload {
  nodeId: string;
}

export class CreateSpotLightCommand extends CommandBase<CreateSpotLightCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-spot-light',
    title: 'Create Spot Light',
    description: 'Create a new spot light in the scene',
    keywords: ['create', 'light', 'spot', '3d', 'add'],
  };

  private readonly params: CreateSpotLightOperationParams;

  constructor(params: CreateSpotLightOperationParams = {}) {
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
        reason: 'An active scene is required to create a spot light',
        scope: 'scene' as const,
      };
    }
    return { canExecute: true };
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateSpotLightCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const sceneManager = context.container.getService<SceneManager>(
      context.container.getOrCreateToken(SceneManager)
    );

    const op = new CreateSpotLightOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);

    const activeSceneGraph = sceneManager.getActiveSceneGraph();
    const nodeId = activeSceneGraph?.rootNodes[activeSceneGraph.rootNodes.length - 1]?.nodeId || '';

    return { didMutate: pushed, payload: { nodeId } };
  }
}
