import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateGroup2DOperation,
  type CreateGroup2DOperationParams,
} from '@/features/scene/CreateGroup2DOperation';
import { SceneManager } from '@pix3/runtime';

export interface CreateGroup2DCommandPayload {
  nodeId: string;
}

export class CreateGroup2DCommand extends CommandBase<CreateGroup2DCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-group2d',
    title: 'Create Group2D',
    description: 'Create a new 2D group container in the scene',
    keywords: ['create', 'group', '2d', 'container', 'add'],
  };

  private readonly params: CreateGroup2DOperationParams;

  constructor(params: CreateGroup2DOperationParams = {}) {
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
        reason: 'An active scene is required to create a Group2D',
        scope: 'scene' as const,
      };
    }
    return { canExecute: true };
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateGroup2DCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const sceneManager = context.container.getService<SceneManager>(
      context.container.getOrCreateToken(SceneManager)
    );

    const op = new CreateGroup2DOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);

    // Get the created node ID from the scene graph
    const activeSceneGraph = sceneManager.getActiveSceneGraph();
    const nodeId = activeSceneGraph?.rootNodes[activeSceneGraph.rootNodes.length - 1]?.nodeId || '';

    return { didMutate: pushed, payload: { nodeId } };
  }
}
