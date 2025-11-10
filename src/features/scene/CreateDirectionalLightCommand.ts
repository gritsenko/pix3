import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import { CreateDirectionalLightOperation, type CreateDirectionalLightOperationParams } from '@/features/scene/CreateDirectionalLightOperation';
import { SceneManager } from '@/core/SceneManager';

export interface CreateDirectionalLightCommandPayload {
  nodeId: string;
}

export class CreateDirectionalLightCommand extends CommandBase<CreateDirectionalLightCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-directional-light',
    title: 'Create Directional Light',
    description: 'Create a new directional light in the scene',
    keywords: ['create', 'light', 'directional', '3d', 'add'],
  };

  private readonly params: CreateDirectionalLightOperationParams;

  constructor(params: CreateDirectionalLightOperationParams = {}) {
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
        reason: 'An active scene is required to create a directional light',
        scope: 'scene' as const,
      };
    }
    return { canExecute: true };
  }

  async execute(context: CommandContext): Promise<CommandExecutionResult<CreateDirectionalLightCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const sceneManager = context.container.getService<SceneManager>(
      context.container.getOrCreateToken(SceneManager)
    );

    const op = new CreateDirectionalLightOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);

    // Get the created node ID from the scene graph
    const activeSceneGraph = sceneManager.getActiveSceneGraph();
    const nodeId = activeSceneGraph?.rootNodes[activeSceneGraph.rootNodes.length - 1]?.nodeId || '';

    return { didMutate: pushed, payload: { nodeId } };
  }
}