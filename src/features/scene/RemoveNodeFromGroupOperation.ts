import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { SceneManager } from '@pix3/runtime';

export interface RemoveNodeFromGroupParams {
  nodeId: string;
  group: string;
}

export class RemoveNodeFromGroupOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.remove-node-from-group',
    title: 'Remove Node From Group',
    description: 'Remove a node from a scene group',
    tags: ['scene', 'groups'],
  };

  constructor(private readonly params: RemoveNodeFromGroupParams) {}

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { container, state } = context;
    const sceneId = state.scenes.activeSceneId;
    if (!sceneId) {
      return { didMutate: false };
    }

    const group = this.params.group.trim();
    if (!group) {
      return { didMutate: false };
    }

    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );
    const scene = sceneManager.getSceneGraph(sceneId);
    if (!scene) {
      return { didMutate: false };
    }

    const node = scene.nodeMap.get(this.params.nodeId);
    if (!node || !node.isInGroup(group)) {
      return { didMutate: false };
    }

    node.removeFromGroup(group);
    sceneManager.removeNodeFromGroup(node, group, sceneId);
    this.markSceneDirty(state, sceneId);

    return {
      didMutate: true,
      commit: {
        label: `Remove "${node.name}" from group "${group}"`,
        undo: async () => {
          node.addToGroup(group);
          sceneManager.addNodeToGroup(node, group, sceneId);
          this.markSceneDirty(state, sceneId);
        },
        redo: async () => {
          node.removeFromGroup(group);
          sceneManager.removeNodeFromGroup(node, group, sceneId);
          this.markSceneDirty(state, sceneId);
        },
      },
    };
  }

  private markSceneDirty(state: OperationContext['state'], sceneId: string): void {
    state.scenes.lastLoadedAt = Date.now();
    state.scenes.nodeDataChangeSignal += 1;
    const descriptor = state.scenes.descriptors[sceneId];
    if (descriptor) {
      descriptor.isDirty = true;
    }
  }
}
