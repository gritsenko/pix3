/**
 * DetachBehaviorOperation - Detach a behavior from a node
 */

import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { SceneManager } from '@/core/SceneManager';

export interface DetachBehaviorParams {
  nodeId: string;
  behaviorId: string;
}

export class DetachBehaviorOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata;
  private readonly params: DetachBehaviorParams;

  constructor(params: DetachBehaviorParams) {
    this.params = params;
    this.metadata = {
      id: 'scripts.detach-behavior',
      title: 'Detach Behavior',
      description: `Detach behavior from node`,
      affectsNodeStructure: false,
      tags: ['scripts', 'behavior'],
    };
  }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { container } = context;
    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );

    const scene = sceneManager.getActiveSceneGraph();
    if (!scene) {
      console.error('[DetachBehaviorOperation] No active scene');
      return { didMutate: false };
    }

    const node = scene.nodeMap.get(this.params.nodeId);
    if (!node) {
      console.error(`[DetachBehaviorOperation] Node "${this.params.nodeId}" not found`);
      return { didMutate: false };
    }

    // Find behavior by ID
    const behaviorIndex = node.behaviors.findIndex(b => b.id === this.params.behaviorId);
    if (behaviorIndex === -1) {
      console.error(
        `[DetachBehaviorOperation] Behavior "${this.params.behaviorId}" not found on node`
      );
      return { didMutate: false };
    }

    const behavior = node.behaviors[behaviorIndex];

    // Store state for undo
    const behaviorState = {
      behavior,
      index: behaviorIndex,
      wasEnabled: behavior.enabled,
      parameters: { ...behavior.parameters },
    };

    // Call onDetach lifecycle method if defined
    if (behavior.onDetach) {
      behavior.onDetach();
    }

    behavior.node = null;
    node.behaviors.splice(behaviorIndex, 1);

    return {
      didMutate: true,
      commit: {
        label: `Detach Behavior ${behavior.type}`,
        undo: async () => {
          // Re-attach behavior
          node.behaviors.splice(behaviorState.index, 0, behaviorState.behavior);
          behaviorState.behavior.node = node;
          behaviorState.behavior.enabled = behaviorState.wasEnabled;
          if (behaviorState.behavior.onAttach) {
            behaviorState.behavior.onAttach(node);
          }
        },
        redo: async () => {
          // Detach again
          const idx = node.behaviors.indexOf(behaviorState.behavior);
          if (idx !== -1) {
            if (behaviorState.behavior.onDetach) {
              behaviorState.behavior.onDetach();
            }
            behaviorState.behavior.node = null;
            node.behaviors.splice(idx, 1);
          }
        },
      },
    };
  }
}
