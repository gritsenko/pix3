import { CommandBase, type CommandExecutionResult, type CommandMetadata, type CommandContext } from './command';
import { OperationService } from '@/core/operations/OperationService';
import { UpdateObjectPropertyOperation } from '@/core/operations/UpdateObjectPropertyOperation';
import { SceneManager } from '@/core/scene/SceneManager';

export interface UpdateObjectPropertyExecutePayload {}

export interface UpdateObjectPropertyParams {
  /** Node ID to update */
  nodeId: string;
  /** Property path (e.g., 'visible', 'position.x', 'rotation.y') */
  propertyPath: string;
  /** New value to set */
  value: unknown;
}

/**
 * Command for updating properties on scene objects with support for:
 * - Transform properties (position.x/y/z, rotation.x/y/z, scale.x/y/z)
 * - Generic node properties (visible, name, etc.)
 * - Proper validation based on node type
 * - Full undo/redo support
 *
 * Transform properties are handled specially:
 * - Rotation values are expected in degrees and converted to radians
 * - Scale properties have minimum bounds (typically > 0)
 * - Position properties are unbounded
 */
export class UpdateObjectPropertyCommand extends CommandBase<
  UpdateObjectPropertyExecutePayload,
  void
> {
  readonly metadata: CommandMetadata = {
    id: 'scene.update-object-property',
    title: 'Update Object Property',
    description: 'Update a property on a scene object',
    keywords: ['update', 'property', 'object', 'node', 'transform'],
  };

  private readonly params: UpdateObjectPropertyParams;

  constructor(params: UpdateObjectPropertyParams) {
    super();
    this.params = params;
  }

  // Delegate validation to operation; keep command preconditions minimal
  preconditions(_context: CommandContext) {
    const sceneManager = _context.container.getService<SceneManager>(
      _context.container.getOrCreateToken(SceneManager)
    );
    return { canExecute: Boolean(sceneManager.getActiveSceneGraph()) };
  }

  async execute(context: CommandContext): Promise<CommandExecutionResult<UpdateObjectPropertyExecutePayload>> {
    const operations = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const op = new UpdateObjectPropertyOperation(this.params);
    const pushed = await operations.invokeAndPush(op);
    return { didMutate: pushed, payload: {} };
  }

  // Undo is provided by the operation commit; no postCommit needed
}
