import { CommandBase, type CommandExecutionResult, type CommandMetadata, type CommandContext } from './command';
import { OperationService } from '@/core/operations/OperationService';
import { SelectObjectOperation } from '@/core/operations/SelectObjectOperation';

export interface SelectObjectExecutePayload {}

export interface SelectObjectParams {
  /** Node ID to select. If null, deselect all */
  nodeId: string | null;
  /** Whether to add to current selection (Ctrl+click behavior) */
  additive?: boolean;
  /** Whether to select range from primary to this node (Shift+click behavior) */
  range?: boolean;
  /** Force this node to be the new primary selection */
  makePrimary?: boolean;
}

/**
 * Command for selecting objects in the scene hierarchy with support for:
 * - Single selection (replace current selection)
 * - Additive selection (Ctrl+click to add/remove from selection)
 * - Range selection (Shift+click to select range)
 * - Deselection (nodeId: null)
 *
 * This command is undoable and will restore previous selection state.
 */
export class SelectObjectCommand extends CommandBase<SelectObjectExecutePayload, void> {
  readonly metadata: CommandMetadata = {
    id: 'scene.select-object',
    title: 'Select Object',
    description: 'Select one or more objects in the scene hierarchy',
    keywords: ['select', 'object', 'node', 'hierarchy'],
  };

  private readonly params: SelectObjectParams;

  constructor(params: SelectObjectParams) {
    super();
    this.params = params;
  }

  async execute(context: CommandContext): Promise<CommandExecutionResult<SelectObjectExecutePayload>> {
    const operations = context.container.getService<OperationService>(
      context.container.getOrCreateToken(OperationService)
    );
    const op = new SelectObjectOperation(this.params);
    const pushed = await operations.invokeAndPush(op);
    return { didMutate: pushed, payload: {} };
  }

  // No local helpers needed; selection logic is handled by the SelectObjectOperation
}

/**
 * Convenience factory for creating select commands
 */
export const createSelectObjectCommand = (params: SelectObjectParams) =>
  new SelectObjectCommand(params);

/**
 * Convenience function for single selection
 */
export const selectObject = (nodeId: string | null) => new SelectObjectCommand({ nodeId });

/**
 * Convenience function for additive selection
 */
export const toggleObjectSelection = (nodeId: string) =>
  new SelectObjectCommand({ nodeId, additive: true });

/**
 * Convenience function for range selection
 */
export const selectObjectRange = (nodeId: string) =>
  new SelectObjectCommand({ nodeId, range: true });
