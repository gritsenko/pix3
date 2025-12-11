import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  CreateBoxOperation,
  type CreateBoxOperationParams,
} from '@/features/scene/CreateBoxOperation';
import { SceneManager } from '@/core/SceneManager';

export interface CreateBoxCommandPayload {
  nodeId: string;
}

export class CreateBoxCommand extends CommandBase<CreateBoxCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-box',
    title: 'Create Box',
    description: 'Create a new box geometry mesh in the scene',
    keywords: ['create', 'box', 'geometry', 'mesh', 'add'],
  };

  private readonly params: CreateBoxOperationParams;

  constructor(params: CreateBoxOperationParams = {}) {
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
        reason: 'An active scene is required to create a box',
        scope: 'scene' as const,
      };
    }
    return { canExecute: true };
  }

  async execute(context: CommandContext): Promise<CommandExecutionResult<CreateBoxCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const sceneManager = context.container.getService<SceneManager>(
      context.container.getOrCreateToken(SceneManager)
    );

    const op = new CreateBoxOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);

    // Get the created node ID from the scene graph
    const activeSceneGraph = sceneManager.getActiveSceneGraph();
    const nodeId = activeSceneGraph?.rootNodes[activeSceneGraph.rootNodes.length - 1]?.nodeId || '';

    return { didMutate: pushed, payload: { nodeId } };
  }
}
