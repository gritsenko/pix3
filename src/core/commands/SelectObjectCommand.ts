import {
  CommandBase,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandContext,
  type CommandUndoPayload,
} from './command';
import type { AppStateSnapshot } from '@/state';

export interface SelectObjectExecutePayload {
  /** The node IDs that were selected */
  selectedNodeIds: string[];
  /** The primary node ID that was selected */
  primaryNodeId: string | null;
  /** Whether this was an additive selection (Ctrl+click) */
  isAdditive: boolean;
  /** Whether this was a multi-selection range (Shift+click) */
  isRange: boolean;
}

export interface SelectObjectUndoPayload {
  /** Previous selection state to restore */
  previousNodeIds: readonly string[];
  /** Previous primary node to restore */
  previousPrimaryNodeId: string | null;
}

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
export class SelectObjectCommand extends CommandBase<
  SelectObjectExecutePayload,
  SelectObjectUndoPayload
> {
  readonly metadata: CommandMetadata = {
    id: 'scene.select-object',
    title: 'Select Object',
    description: 'Select one or more objects in the scene hierarchy',
    keywords: ['select', 'object', 'node', 'hierarchy'],
    personas: ['technical-artist', 'gameplay-engineer'],
  };

  private readonly params: SelectObjectParams;

  constructor(params: SelectObjectParams) {
    super();
    this.params = params;
  }

  execute(context: CommandContext): CommandExecutionResult<SelectObjectExecutePayload> {
    const { state, snapshot } = context;
    const { nodeId, additive = false, range = false, makePrimary = false } = this.params;

    let newNodeIds: string[];
    let newPrimaryNodeId: string | null;

    if (nodeId === null) {
      // Deselect all
      newNodeIds = [];
      newPrimaryNodeId = null;
    } else if (range && snapshot.selection.primaryNodeId) {
      // Range selection: select from primary to target
      const sceneHierarchy = this.getActiveSceneHierarchy(snapshot);
      if (sceneHierarchy) {
        const allNodeIds = this.collectAllNodeIds(sceneHierarchy.nodes);
        const primaryIndex = allNodeIds.indexOf(snapshot.selection.primaryNodeId);
        const targetIndex = allNodeIds.indexOf(nodeId);

        if (primaryIndex !== -1 && targetIndex !== -1) {
          const startIndex = Math.min(primaryIndex, targetIndex);
          const endIndex = Math.max(primaryIndex, targetIndex);
          newNodeIds = allNodeIds.slice(startIndex, endIndex + 1);
          newPrimaryNodeId = snapshot.selection.primaryNodeId; // Keep original primary
        } else {
          // Fallback to single selection if range can't be determined
          newNodeIds = [nodeId];
          newPrimaryNodeId = nodeId;
        }
      } else {
        newNodeIds = [nodeId];
        newPrimaryNodeId = nodeId;
      }
    } else if (additive) {
      // Additive selection: toggle node in current selection
      const currentSelection = new Set(snapshot.selection.nodeIds);
      if (currentSelection.has(nodeId)) {
        // Remove from selection
        currentSelection.delete(nodeId);
        newNodeIds = Array.from(currentSelection);
        // If we removed the primary, pick a new one or clear it
        newPrimaryNodeId =
          snapshot.selection.primaryNodeId === nodeId
            ? newNodeIds.length > 0
              ? newNodeIds[0]
              : null
            : snapshot.selection.primaryNodeId;
      } else {
        // Add to selection
        currentSelection.add(nodeId);
        newNodeIds = Array.from(currentSelection);
        newPrimaryNodeId =
          makePrimary || !snapshot.selection.primaryNodeId
            ? nodeId
            : snapshot.selection.primaryNodeId;
      }
    } else {
      // Single selection: replace current selection
      newNodeIds = [nodeId];
      newPrimaryNodeId = nodeId;
    }

    // Update state
    state.selection.nodeIds = newNodeIds;
    state.selection.primaryNodeId = newPrimaryNodeId;

    return {
      didMutate: true,
      payload: {
        selectedNodeIds: newNodeIds,
        primaryNodeId: newPrimaryNodeId,
        isAdditive: additive,
        isRange: range,
      },
    };
  }

  postCommit(
    context: CommandContext,
    _payload: SelectObjectExecutePayload
  ): CommandUndoPayload<SelectObjectUndoPayload> {
    return {
      previousNodeIds: context.snapshot.selection.nodeIds,
      previousPrimaryNodeId: context.snapshot.selection.primaryNodeId,
    };
  }

  private getActiveSceneHierarchy(snapshot: AppStateSnapshot) {
    const activeSceneId = snapshot.scenes.activeSceneId;
    return activeSceneId ? snapshot.scenes.hierarchies[activeSceneId] : null;
  }

  private collectAllNodeIds(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nodes: readonly { readonly id: string; readonly children: readonly any[] }[]
  ): string[] {
    const result: string[] = [];
    const collectRecursive = (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nodeList: readonly { readonly id: string; readonly children: readonly any[] }[]
    ) => {
      for (const node of nodeList) {
        result.push(node.id);
        if (node.children?.length > 0) {
          collectRecursive(node.children);
        }
      }
    };
    collectRecursive(nodes);
    return result;
  }
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
