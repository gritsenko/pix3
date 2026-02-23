import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { SceneManager } from '@pix3/runtime';

export interface AddNodeToGroupParams {
  nodeId: string;
  group: string;
}

export class AddNodeToGroupOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.add-node-to-group',
    title: 'Add Node To Group',
    description: 'Add a node to a scene group',
    tags: ['scene', 'groups'],
  };

  constructor(private readonly params: AddNodeToGroupParams) {}

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
    if (!node || node.isInGroup(group)) {
      return { didMutate: false };
    }

    node.addToGroup(group);
    sceneManager.addNodeToGroup(node, group, sceneId);
    this.markSceneDirty(state, sceneId);

    return {
      didMutate: true,
      commit: {
        label: `Add "${node.name}" to group "${group}"`,
        undo: async () => {
          node.removeFromGroup(group);
          sceneManager.removeNodeFromGroup(node, group, sceneId);
          this.markSceneDirty(state, sceneId);
        },
        redo: async () => {
          node.addToGroup(group);
          sceneManager.addNodeToGroup(node, group, sceneId);
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
