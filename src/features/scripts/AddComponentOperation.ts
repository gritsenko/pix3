/**
 * AddComponentOperation - Add a component to a node
 */

import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { SceneManager } from '@/core/SceneManager';
import { ScriptRegistry } from '@/services/ScriptRegistry';

export interface AddComponentParams {
  nodeId: string;
  componentType: string;
  componentId?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

export class AddComponentOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata;
  private readonly params: AddComponentParams;

  constructor(params: AddComponentParams) {
    this.params = params;
    this.metadata = {
      id: 'scripts.add-component',
      title: 'Add Component',
      description: `Add component ${params.componentType} to node`,
      affectsNodeStructure: false,
      tags: ['scripts', 'component'],
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
      console.error('[AddComponentOperation] No active scene');
      return { didMutate: false };
    }

    const node = scene.nodeMap.get(this.params.nodeId);
    if (!node) {
      console.error(`[AddComponentOperation] Node "${this.params.nodeId}" not found`);
      return { didMutate: false };
    }

    // Generate component ID if not provided
    const componentId = this.params.componentId || `${this.params.nodeId}-${this.params.componentType}-${Date.now()}`;

    // Create component instance
    const component = scriptRegistry.createComponent(
      this.params.componentType,
      componentId
    );
    if (!component) {
      console.error(
        `[AddComponentOperation] Failed to create component "${this.params.componentType}"`
      );
      return { didMutate: false };
    }

    // Set config if provided
    if (this.params.config) {
      component.config = { ...this.params.config };

      // Use PropertySchema to set config properly
      const schema = scriptRegistry.getComponentPropertySchema(this.params.componentType);
      if (schema) {
        for (const prop of schema.properties) {
          if (this.params.config[prop.name] !== undefined) {
            prop.setValue(component, this.params.config[prop.name]);
          }
        }
      }
    }

    // Set enabled state
    if (this.params.enabled !== undefined) {
      component.enabled = this.params.enabled;
    }

    // Add component to node using the new API
    node.addComponent(component);

    return {
      didMutate: true,
      commit: {
        label: `Add Component ${this.params.componentType}`,
        undo: async () => {
          // Remove component from node
          node.removeComponent(component);
        },
        redo: async () => {
          // Re-add component to node
          node.addComponent(component);
        },
      },
    };
  }
}
