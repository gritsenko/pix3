import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import { CreateMeshInstanceOperation, type CreateMeshInstanceOperationParams } from '@/features/scene/CreateMeshInstanceOperation';
import { SceneManager } from '@/core/SceneManager';

export interface CreateMeshInstanceCommandPayload {
  nodeId: string;
}

export class CreateMeshInstanceCommand extends CommandBase<CreateMeshInstanceCommandPayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.create-mesh-instance',
    title: 'Create Mesh Instance',
    description: 'Create a new 3D mesh instance in the scene',
    keywords: ['create', 'mesh', 'model', '3d', 'import', 'add'],
  };

  private readonly params: CreateMeshInstanceOperationParams;

  constructor(params: CreateMeshInstanceOperationParams = {}) {
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
        reason: 'An active scene is required to create a mesh instance',
        scope: 'scene' as const,
      };
    }
    return { canExecute: true };
  }

  async execute(context: CommandContext): Promise<CommandExecutionResult<CreateMeshInstanceCommandPayload>> {
    const operationService = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const sceneManager = context.container.getService<SceneManager>(
      context.container.getOrCreateToken(SceneManager)
    );

    const op = new CreateMeshInstanceOperation(this.params);
    const pushed = await operationService.invokeAndPush(op);

    // Get the created node ID from the scene graph
    const activeSceneGraph = sceneManager.getActiveSceneGraph();
    const nodeId = activeSceneGraph?.rootNodes[activeSceneGraph.rootNodes.length - 1]?.nodeId || '';

    return { didMutate: pushed, payload: { nodeId } };
  }
}