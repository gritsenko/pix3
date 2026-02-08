/**
 * ToggleScriptEnabledOperation - Toggle enabled state of a component
 */

import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { SceneManager } from '@pix3/runtime';

export interface ToggleScriptEnabledParams {
  nodeId: string;
  componentId: string;
  enabled: boolean;
}

export class ToggleScriptEnabledOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata;
  private readonly params: ToggleScriptEnabledParams;

  constructor(params: ToggleScriptEnabledParams) {
    this.params = params;
    this.metadata = {
      id: 'scripts.toggle-enabled',
      title: 'Toggle Component Enabled',
      description: `Toggle component enabled state`,
      affectsNodeStructure: false,
      tags: ['scripts', 'component'],
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

    const component = node.components.find(c => c.id === this.params.componentId);
    if (!component) {
      console.error(
        `[ToggleScriptEnabledOperation] Component "${this.params.componentId}" not found`
      );
      return { didMutate: false };
    }

    const previousEnabled = component.enabled;
    component.enabled = this.params.enabled;

    // Mark scene as dirty
    const activeSceneId = context.state.scenes.activeSceneId;
    if (activeSceneId) {
      const descriptor = context.state.scenes.descriptors[activeSceneId];
      if (descriptor) {
        descriptor.isDirty = true;
      }
    }

    return {
      didMutate: true,
      commit: {
        label: `Toggle ${component.type} ${this.params.enabled ? 'On' : 'Off'}`,
        undo: async () => {
          component.enabled = previousEnabled;
          // Mark scene as dirty on undo
          if (activeSceneId) {
            const descriptor = context.state.scenes.descriptors[activeSceneId];
            if (descriptor) descriptor.isDirty = true;
          }
        },
        redo: async () => {
          component.enabled = this.params.enabled;
          // Mark scene as dirty on redo
          if (activeSceneId) {
            const descriptor = context.state.scenes.descriptors[activeSceneId];
            if (descriptor) descriptor.isDirty = true;
          }
        },
      },
    };
  }
}
