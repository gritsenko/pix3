import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateLayout2DOperation,
  type CreateLayout2DOperationParams,
} from '@/features/scene/CreateLayout2DOperation';
import { SceneManager } from '@pix3/runtime';

export interface CreateLayout2DCommandPayload {
  nodeId: string;
}

export class CreateLayout2DCommand extends CommandBase<CreateLayout2DCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-layout2d',
    title: 'Create Layout2D',
    description: 'Create a new Layout2D root node',
    keywords: ['create', 'layout2d', 'viewport', 'container', 'root'],
  };

  private readonly params: CreateLayout2DOperationParams;

  constructor(params: CreateLayout2DOperationParams = {}) {
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
        reason: 'An active scene is required to create a Layout2D',
        scope: 'scene' as const,
      };
    }
    return { canExecute: true };
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateLayout2DCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const sceneManager = context.container.getService<SceneManager>(
      context.container.getOrCreateToken(SceneManager)
    );

    const op = new CreateLayout2DOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);

    // Get the created node ID from scene graph
    const activeSceneGraph = sceneManager.getActiveSceneGraph();
    const nodeId = activeSceneGraph?.rootNodes[activeSceneGraph.rootNodes.length - 1]?.nodeId || '';

    return { didMutate: pushed, payload: { nodeId } };
  }
}
