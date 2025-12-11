import {
  CommandBase as CommandBaseImpl,
  type CommandExecutionResult as CommandExecutionResultType,
  type CommandContext as CommandContextType,
  type CommandMetadata as CommandMetadataType,
} from '@/core/command';
import { OperationService } from '@/services/OperationService';
import {
  UpdateGroup2DSizeOperation,
  type UpdateGroup2DSizeParams,
} from './UpdateGroup2DSizeOperation';
import { SceneManager } from '@/core/SceneManager';
import { Group2D } from '@/nodes/2D/Group2D';

export type UpdateGroup2DSizeExecutePayload = object;

export class UpdateGroup2DSizeCommand extends CommandBaseImpl<
  UpdateGroup2DSizeExecutePayload,
  void
> {
  readonly metadata: CommandMetadataType = {
    id: 'scene.update-group2d-size',
    title: 'Update Group2D Size',
    description: 'Update the width and height of a Group2D node',
    keywords: ['update', 'property', 'group2d', 'size'],
  };

  private readonly params: UpdateGroup2DSizeParams;

  constructor(params: UpdateGroup2DSizeParams) {
    super();
    this.params = params;
  }

  preconditions(context: CommandContextType) {
    const sceneManager = context.container.getService<SceneManager>(
      context.container.getOrCreateToken(SceneManager)
    );
    const sceneGraph = sceneManager.getActiveSceneGraph();
    if (!sceneGraph) {
      return { canExecute: false, reason: 'No active scene' };
    }

    const node = sceneGraph.nodeMap.get(this.params.nodeId);
    if (!(node instanceof Group2D)) {
      return { canExecute: false, reason: 'Node is not a Group2D' };
    }

    return { canExecute: true };
  }

  async execute(
    context: CommandContextType
  ): Promise<CommandExecutionResultType<UpdateGroup2DSizeExecutePayload>> {
    const operations = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const op = new UpdateGroup2DSizeOperation(this.params);
    const pushed = await operations.invokeAndPush(op);
    return { didMutate: pushed, payload: {} };
  }
}
