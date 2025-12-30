/**
 * AttachBehaviorOperation - Attach a behavior to a node
 */

import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { SceneManager } from '@/core/SceneManager';
import { ScriptRegistry } from '@/services/ScriptRegistry';

export interface AttachBehaviorParams {
  nodeId: string;
  behaviorType: string;
  behaviorId: string;
  parameters?: Record<string, unknown>;
  enabled?: boolean;
}

export class AttachBehaviorOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata;
  private readonly params: AttachBehaviorParams;

  constructor(params: AttachBehaviorParams) {
    this.params = params;
    this.metadata = {
      id: 'scripts.attach-behavior',
      title: 'Attach Behavior',
      description: `Attach behavior ${params.behaviorType} to node`,
      affectsNodeStructure: false,
      tags: ['scripts', 'behavior'],
    };
  }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { container } = context;
    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );
    const scriptRegistry = container.getService<ScriptRegistry>(
      container.getOrCreateToken(ScriptRegistry)
    );

    const scene = sceneManager.getActiveSceneGraph();
    if (!scene) {
      console.error('[AttachBehaviorOperation] No active scene');
      return { didMutate: false };
    }

    const node = scene.nodeMap.get(this.params.nodeId);
    if (!node) {
      console.error(`[AttachBehaviorOperation] Node "${this.params.nodeId}" not found`);
      return { didMutate: false };
    }

    // Create behavior instance
    const behavior = scriptRegistry.createBehavior(
      this.params.behaviorType,
      this.params.behaviorId
    );
    if (!behavior) {
      console.error(
        `[AttachBehaviorOperation] Failed to create behavior "${this.params.behaviorType}"`
      );
      return { didMutate: false };
    }

    // Set parameters if provided
    if (this.params.parameters) {
      behavior.parameters = { ...this.params.parameters };

      // Use PropertySchema to set parameters properly
      const schema = scriptRegistry.getBehaviorPropertySchema(this.params.behaviorType);
      if (schema) {
        for (const prop of schema.properties) {
          if (this.params.parameters[prop.name] !== undefined) {
            prop.setValue(behavior, this.params.parameters[prop.name]);
          }
        }
      }
    }

    // Set enabled state
    if (this.params.enabled !== undefined) {
      behavior.enabled = this.params.enabled;
    }

    // Attach behavior to node
    node.behaviors.push(behavior);
    behavior.node = node;

    // Call onAttach lifecycle method if defined
    if (behavior.onAttach) {
      behavior.onAttach(node);
    }

    return {
      didMutate: true,
      commit: {
        label: `Attach Behavior ${this.params.behaviorType}`,
        undo: async () => {
          // Remove behavior from node
          const index = node.behaviors.indexOf(behavior);
          if (index !== -1) {
            // Call onDetach lifecycle method if defined
            if (behavior.onDetach) {
              behavior.onDetach();
            }
            behavior.node = null;
            node.behaviors.splice(index, 1);
          }
        },
        redo: async () => {
          // Re-attach behavior to node
          node.behaviors.push(behavior);
          behavior.node = node;
          if (behavior.onAttach) {
            behavior.onAttach(node);
          }
        },
      },
    };
  }
}
