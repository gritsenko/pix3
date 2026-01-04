import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateSprite2DOperation,
  type CreateSprite2DOperationParams,
} from '@/features/scene/CreateSprite2DOperation';
import { SceneManager } from '@/core/SceneManager';

export interface CreateSprite2DCommandPayload {
  nodeId: string;
}

export class CreateSprite2DCommand extends CommandBase<CreateSprite2DCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-sprite2d',
    title: 'Create Sprite2D',
    description: 'Create a new 2D sprite in the scene',
    keywords: ['create', 'sprite', '2d', 'image', 'add'],
  };

  private readonly params: CreateSprite2DOperationParams;

  constructor(params: CreateSprite2DOperationParams = {}) {
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
        reason: 'An active scene is required to create a Sprite2D',
        scope: 'scene' as const,
      };
    }
    return { canExecute: true };
  }

  async execute(
    context: CommandContext
  ): Promise<CommandExecutionResult<CreateSprite2DCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const sceneManager = context.container.getService<SceneManager>(
      context.container.getOrCreateToken(SceneManager)
    );

    const op = new CreateSprite2DOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);

    // Get the created node ID from the scene graph
    const activeSceneGraph = sceneManager.getActiveSceneGraph();
    // Get the last child of the rootNode (which would be the newly created sprite)
    const lastChild = activeSceneGraph?.rootNode.children[activeSceneGraph.rootNode.children.length - 1];
    const nodeId = (lastChild as any)?.nodeId || '';

    return { didMutate: pushed, payload: { nodeId } };
  }
}
