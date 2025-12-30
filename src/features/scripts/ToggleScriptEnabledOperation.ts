/**
 * ToggleScriptEnabledOperation - Toggle enabled state of a behavior or controller
 */

import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { SceneManager } from '@/core/SceneManager';

export interface ToggleScriptEnabledParams {
  nodeId: string;
  scriptType: 'behavior' | 'controller';
  scriptId?: string; // Required for behaviors, not used for controllers
  enabled: boolean;
}

export class ToggleScriptEnabledOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata;
  private readonly params: ToggleScriptEnabledParams;

  constructor(params: ToggleScriptEnabledParams) {
    this.params = params;
    this.metadata = {
      id: 'scripts.toggle-enabled',
      title: 'Toggle Script Enabled',
      description: `Toggle ${params.scriptType} enabled state`,
      affectsNodeStructure: false,
      tags: ['scripts', params.scriptType],
    };
  }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { container } = context;
    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );

    const scene = sceneManager.getActiveSceneGraph();
    if (!scene) {
      console.error('[ToggleScriptEnabledOperation] No active scene');
      return { didMutate: false };
    }

    const node = scene.nodeMap.get(this.params.nodeId);
    if (!node) {
      console.error(`[ToggleScriptEnabledOperation] Node "${this.params.nodeId}" not found`);
      return { didMutate: false };
    }

    let previousEnabled: boolean;
    let scriptName: string;

    if (this.params.scriptType === 'behavior') {
      if (!this.params.scriptId) {
        console.error('[ToggleScriptEnabledOperation] scriptId required for behavior');
        return { didMutate: false };
      }

      const behavior = node.behaviors.find(b => b.id === this.params.scriptId);
      if (!behavior) {
        console.error(
          `[ToggleScriptEnabledOperation] Behavior "${this.params.scriptId}" not found`
        );
        return { didMutate: false };
      }

      previousEnabled = behavior.enabled;
      behavior.enabled = this.params.enabled;
      scriptName = behavior.type;
    } else {
      // controller
      if (!node.controller) {
        console.error('[ToggleScriptEnabledOperation] No controller attached to node');
        return { didMutate: false };
      }

      previousEnabled = node.controller.enabled;
      node.controller.enabled = this.params.enabled;
      scriptName = node.controller.type;
    }

    return {
      didMutate: true,
      commit: {
        label: `${this.params.enabled ? 'Enable' : 'Disable'} ${scriptName}`,
        undo: async () => {
          if (this.params.scriptType === 'behavior' && this.params.scriptId) {
            const behavior = node.behaviors.find(b => b.id === this.params.scriptId);
            if (behavior) {
              behavior.enabled = previousEnabled;
            }
          } else if (node.controller) {
            node.controller.enabled = previousEnabled;
          }
        },
        redo: async () => {
          if (this.params.scriptType === 'behavior' && this.params.scriptId) {
            const behavior = node.behaviors.find(b => b.id === this.params.scriptId);
            if (behavior) {
              behavior.enabled = this.params.enabled;
            }
          } else if (node.controller) {
            node.controller.enabled = this.params.enabled;
          }
        },
      },
    };
  }
}
