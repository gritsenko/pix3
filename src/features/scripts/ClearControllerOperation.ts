/**
 * ClearControllerOperation - Remove controller from a node
 */

import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { SceneManager } from '@/core/SceneManager';

export interface ClearControllerParams {
  nodeId: string;
}

export class ClearControllerOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata;
  private readonly params: ClearControllerParams;

  constructor(params: ClearControllerParams) {
    this.params = params;
    this.metadata = {
      id: 'scripts.clear-controller',
      title: 'Clear Controller',
      description: 'Remove controller from node',
      affectsNodeStructure: false,
      tags: ['scripts', 'controller'],
    };
  }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { container } = context;
    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );

    const scene = sceneManager.getActiveSceneGraph();
    if (!scene) {
      console.error('[ClearControllerOperation] No active scene');
      return { didMutate: false };
    }

    const node = scene.nodeMap.get(this.params.nodeId);
    if (!node) {
      console.error(`[ClearControllerOperation] Node "${this.params.nodeId}" not found`);
      return { didMutate: false };
    }

    const previous = node.controller;
    if (!previous) {
      return { didMutate: false };
    }

    const detach = () => {
      if (previous.onDetach) previous.onDetach();
      if (previous.resetStartedState) previous.resetStartedState();
      previous.node = null;
    };

    const attach = () => {
      previous.node = node;
      if (previous.resetStartedState) previous.resetStartedState();
      if (previous.onAttach) previous.onAttach(node);
    };

    detach();
    node.controller = null;

    return {
      didMutate: true,
      commit: {
        label: `Clear Controller ${previous.type}`,
        undo: async () => {
          node.controller = previous;
          attach();
        },
        redo: async () => {
          detach();
          node.controller = null;
        },
      },
    };
  }
}
