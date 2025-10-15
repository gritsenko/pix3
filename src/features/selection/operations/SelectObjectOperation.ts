import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import type { AppStateSnapshot } from '@/state';

export interface SelectObjectParams {
  nodeId: string | null;
  additive?: boolean;
  range?: boolean;
  makePrimary?: boolean;
}

export class SelectObjectOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata;
  private readonly params: SelectObjectParams;

  constructor(params: SelectObjectParams) {
    this.params = params;
    this.metadata = {
      id: 'scene.select-object',
      title: 'Select Object',
      description: 'Select one or more objects in the scene hierarchy',
      tags: ['selection'],
      coalesceKey: undefined,
    };
  }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { state, snapshot } = context;
    const { nodeId, additive = false, range = false, makePrimary = false } = this.params;

    const prevNodeIds = [...snapshot.selection.nodeIds];
    const prevPrimaryId = snapshot.selection.primaryNodeId;

    const { newNodeIds, newPrimaryNodeId } = this.computeSelection(snapshot, {
      nodeId,
      additive,
      range,
      makePrimary,
    });

    if (
      prevPrimaryId === newPrimaryNodeId &&
      prevNodeIds.length === newNodeIds.length &&
      prevNodeIds.every((id, i) => id === newNodeIds[i])
    ) {
      return { didMutate: false };
    }

    state.selection.nodeIds = newNodeIds;
    state.selection.primaryNodeId = newPrimaryNodeId;

    return {
      didMutate: true,
      commit: {
        label: 'Select Object',
        beforeSnapshot: context.snapshot,
        undo: async () => {
          state.selection.nodeIds = [...prevNodeIds];
          state.selection.primaryNodeId = prevPrimaryId;
        },
        redo: async () => {
          state.selection.nodeIds = [...newNodeIds];
          state.selection.primaryNodeId = newPrimaryNodeId;
        },
      },
    };
  }

  private computeSelection(
    snapshot: AppStateSnapshot,
    opts: Required<Omit<SelectObjectParams, 'nodeId'>> & { nodeId: string | null }
  ): { newNodeIds: string[]; newPrimaryNodeId: string | null } {
    const { nodeId, additive, range, makePrimary } = opts;

    if (nodeId === null) {
      return { newNodeIds: [], newPrimaryNodeId: null };
    }

    if (range && snapshot.selection.primaryNodeId) {
      const sceneHierarchy = this.getActiveSceneHierarchy(snapshot);
      if (sceneHierarchy) {
        const allNodeIds = this.collectAllNodeIds(sceneHierarchy.rootNodes as any[]);
        const primaryIndex = allNodeIds.indexOf(snapshot.selection.primaryNodeId);
        const targetIndex = allNodeIds.indexOf(nodeId);

        if (primaryIndex !== -1 && targetIndex !== -1) {
          const startIndex = Math.min(primaryIndex, targetIndex);
          const endIndex = Math.max(primaryIndex, targetIndex);
          const selection = allNodeIds.slice(startIndex, endIndex + 1);
          return { newNodeIds: selection, newPrimaryNodeId: snapshot.selection.primaryNodeId };
        }
      }
      return { newNodeIds: [nodeId], newPrimaryNodeId: nodeId };
    }

    if (additive) {
      const current = new Set(snapshot.selection.nodeIds);
      if (current.has(nodeId)) {
        current.delete(nodeId);
        const ids = Array.from(current);
        const newPrimary =
          snapshot.selection.primaryNodeId === nodeId
            ? ids.length > 0
              ? ids[0]
              : null
            : snapshot.selection.primaryNodeId;
        return { newNodeIds: ids, newPrimaryNodeId: newPrimary };
      }
      current.add(nodeId);
      const ids = Array.from(current);
      const newPrimary =
        makePrimary || !snapshot.selection.primaryNodeId
          ? nodeId
          : snapshot.selection.primaryNodeId;
      return { newNodeIds: ids, newPrimaryNodeId: newPrimary };
    }

    return { newNodeIds: [nodeId], newPrimaryNodeId: nodeId };
  }

  private getActiveSceneHierarchy(snapshot: AppStateSnapshot) {
    const activeSceneId = snapshot.scenes.activeSceneId;
    return activeSceneId ? snapshot.scenes.hierarchies[activeSceneId] : null;
  }

  private collectAllNodeIds(nodes: readonly any[]): string[] {
    const result: string[] = [];
    const collect = (list: readonly any[]) => {
      for (const node of list) {
        result.push(node.nodeId || node.id);
        if (node.children?.length) collect(node.children);
      }
    };
    collect(nodes);
    return result;
  }
}
