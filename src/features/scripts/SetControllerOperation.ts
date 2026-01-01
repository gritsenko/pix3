/**
 * SetControllerOperation - Set controller on a node
 */

import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { SceneManager } from '@/core/SceneManager';
import { ScriptRegistry } from '@/services/ScriptRegistry';

export interface SetControllerParams {
  nodeId: string;
  controllerType: string;
}

export class SetControllerOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata;
  private readonly params: SetControllerParams;

  constructor(params: SetControllerParams) {
    this.params = params;

    this.metadata = {
      id: 'scripts.set-controller',
      title: 'Set Controller',
      description: `Set controller ${params.controllerType} on node`,
      affectsNodeStructure: false,
      tags: ['scripts', 'controller'],
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
      console.error('[SetControllerOperation] No active scene');
      return { didMutate: false };
    }

    const node = scene.nodeMap.get(this.params.nodeId);
    if (!node) {
      console.error(`[SetControllerOperation] Node "${this.params.nodeId}" not found`);
      return { didMutate: false };
    }

    const previous = node.controller;
    const next = scriptRegistry.createController(
      this.params.controllerType,
      `${this.params.nodeId}-controller-${Date.now()}`
    );

    if (!next) {
      console.error(
        `[SetControllerOperation] Failed to create controller "${this.params.controllerType}"`
      );
      return { didMutate: false };
    }

    const detach = (controller: typeof previous | null) => {
      if (!controller) return;
      if (controller.onDetach) controller.onDetach();
      controller.node = null;
    };

    const attach = (controller: typeof previous | null) => {
      if (!controller) return;
      controller.node = node;
      if (controller.resetStartedState) controller.resetStartedState();
      if (controller.onAttach) controller.onAttach(node);
    };

    // Replace controller
    detach(previous);
    node.controller = next;
    attach(next);

    return {
      didMutate: true,
      commit: {
        label: `Set Controller ${this.params.controllerType}`,
        undo: async () => {
          detach(node.controller);
          node.controller = previous;
          attach(previous);
        },
        redo: async () => {
          detach(node.controller);
          node.controller = next;
          attach(next);
        },
      },
    };
  }
}
