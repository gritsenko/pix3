import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import type { Layout2D } from '@pix3/runtime';
import type { NodeBase } from '@pix3/runtime';
import { Joystick2D } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { ref } from 'valtio/vanilla';
import { Vector2 } from 'three';
import {
  attachNode,
  detachNode,
  removeAutoCreatedLayoutIfUnused,
  resolveDefault2DParent,
  restoreAutoCreatedLayout,
} from '@/features/scene/node-placement';

export interface CreateJoystick2DOperationParams {
  joystickName?: string;
  radius?: number;
  handleRadius?: number;
  position?: Vector2;
  parentNodeId?: string | null;
}

export class CreateJoystick2DOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-joystick2d',
    title: 'Create Joystick2D',
    description: 'Create a 2D joystick in the scene',
    tags: ['scene', '2d', 'joystick', 'node'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateJoystick2DOperationParams;

  constructor(params: CreateJoystick2DOperationParams = {}) {
    this.params = params;
  }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { state, container } = context;
    const activeSceneId = state.scenes.activeSceneId;

    if (!activeSceneId) {
      return { didMutate: false };
    }

    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );
    const sceneGraph = sceneManager.getSceneGraph(activeSceneId);
    if (!sceneGraph) {
      return { didMutate: false };
    }

    const nodeId = `joystick2d-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const joystickName = this.params.joystickName || 'Joystick2D';

    const node = new Joystick2D({
      id: nodeId,
      name: joystickName,
      position: this.params.position || new Vector2(100, 100), // Default position for visibility
      radius: this.params.radius,
      handleRadius: this.params.handleRadius,
    });

    const parentNodeId = this.params.parentNodeId ?? null;
    const parentNode = parentNodeId ? (sceneGraph.nodeMap.get(parentNodeId) ?? null) : null;
    let autoCreatedLayout: Layout2D | null = null;
    const targetParent =
      parentNode ??
      (() => {
        const result = resolveDefault2DParent(sceneGraph);
        autoCreatedLayout = result.createdLayout;
        return result.parent;
      })();

    const updateHierarchyState = () => {
      const hierarchy = state.scenes.hierarchies[activeSceneId];
      if (hierarchy) {
        state.scenes.hierarchies[activeSceneId] = {
          version: hierarchy.version,
          description: hierarchy.description,
          rootNodes: ref([...sceneGraph.rootNodes]),
          metadata: hierarchy.metadata,
        };
      }
    };

    const markSceneDirty = () => {
      const descriptor = state.scenes.descriptors[activeSceneId];
      if (descriptor) {
        descriptor.isDirty = true;
      }
    };

    const selectCreatedNode = () => {
      state.selection.nodeIds = [nodeId];
      state.selection.primaryNodeId = nodeId;
    };

    const clearSelectionIfTargeted = () => {
      if (state.selection.nodeIds.includes(nodeId)) {
        state.selection.nodeIds = [];
        state.selection.primaryNodeId = null;
      }
    };

    const attachCreatedNode = (targetParentNode: NodeBase | null) => {
      attachNode(sceneGraph, node, targetParentNode);
      updateHierarchyState();
      markSceneDirty();
    };

    const detachCreatedNode = (targetParentNode: NodeBase | null) => {
      detachNode(sceneGraph, node, targetParentNode);
      updateHierarchyState();
      markSceneDirty();
    };

    attachCreatedNode(targetParent);
    selectCreatedNode();

    return {
      didMutate: true,
      commit: {
        label: `Create ${joystickName}`,
        undo: () => {
          detachCreatedNode(targetParent);
          removeAutoCreatedLayoutIfUnused(sceneGraph, autoCreatedLayout);
          updateHierarchyState();
          markSceneDirty();
          clearSelectionIfTargeted();
        },
        redo: () => {
          restoreAutoCreatedLayout(sceneGraph, autoCreatedLayout);
          attachCreatedNode(targetParent);
          selectCreatedNode();
        },
      },
    };
  }
}
