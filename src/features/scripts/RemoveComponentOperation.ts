/**
 * RemoveComponentOperation - Remove a component from a node
 */

import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { SceneManager } from '@pix3/runtime';

export interface RemoveComponentParams {
  nodeId: string;
  componentId: string;
}

export class RemoveComponentOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata;
  private readonly params: RemoveComponentParams;

  constructor(params: RemoveComponentParams) {
    this.params = params;
    this.metadata = {
      id: 'scripts.remove-component',
      title: 'Remove Component',
      description: `Remove component from node`,
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
      console.error('[RemoveComponentOperation] No active scene');
      return { didMutate: false };
    }

    const node = scene.nodeMap.get(this.params.nodeId);
    if (!node) {
      console.error(`[RemoveComponentOperation] Node "${this.params.nodeId}" not found`);
      return { didMutate: false };
    }

    // Find component by ID
    const component = node.components.find(c => c.id === this.params.componentId);
    if (!component) {
      console.error(
        `[RemoveComponentOperation] Component "${this.params.componentId}" not found on node "${this.params.nodeId}"`
      );
      return { didMutate: false };
    }

    // Store component state for undo
    const componentState = {
      config: { ...component.config },
      enabled: component.enabled,
    };

    // Remove component from node
    node.removeComponent(component);

    return {
      didMutate: true,
      commit: {
        label: `Remove Component ${component.type}`,
        undo: async () => {
          // Re-add component to node
          component.config = { ...componentState.config };
          component.enabled = componentState.enabled;
          node.addComponent(component);
        },
        redo: async () => {
          // Remove component again
          node.removeComponent(component);
        },
      },
    };
  }
}
