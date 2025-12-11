import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateCamera3DOperation,
  type CreateCamera3DOperationParams,
} from '@/features/scene/CreateCamera3DOperation';
import { SceneManager } from '@/core/SceneManager';

export interface CreateCamera3DCommandPayload {
  nodeId: string;
}

export class CreateCamera3DCommand extends CommandBase<CreateCamera3DCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-camera3d',
    title: 'Create Camera3D',
    description: 'Create a new 3D camera in the scene',
    keywords: ['create', 'camera', '3d', 'viewport', 'add'],
  };

  private readonly params: CreateCamera3DOperationParams;

  constructor(params: CreateCamera3DOperationParams = {}) {
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
        reason: 'An active scene is required to create a camera',
        scope: 'scene' as const,
      };
    }
    return { canExecute: true };
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateCamera3DCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const sceneManager = context.container.getService<SceneManager>(
      context.container.getOrCreateToken(SceneManager)
    );

    const op = new CreateCamera3DOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);

    // Get the created node ID from the scene graph
    const activeSceneGraph = sceneManager.getActiveSceneGraph();
    const nodeId = activeSceneGraph?.rootNodes[activeSceneGraph.rootNodes.length - 1]?.nodeId || '';

    return { didMutate: pushed, payload: { nodeId } };
  }
}
