import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { SceneStateUpdater } from '@/core/SceneStateUpdater';
import { attachNode, detachNode } from '@/features/scene/node-placement';
import { AudioPlayer, type NodeBase, SceneManager } from '@pix3/runtime';

export interface CreateAudioPlayerOperationParams {
  nodeName?: string;
}

export class CreateAudioPlayerOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.create-audio-player',
    title: 'Create AudioPlayer',
    description: 'Create an audio playback node in the scene',
    tags: ['scene', 'audio', 'node', 'player'],
    affectsNodeStructure: true,
  };

  private readonly params: CreateAudioPlayerOperationParams;

  constructor(params: CreateAudioPlayerOperationParams = {}) {
    this.params = params;
  }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { state, container, snapshot } = context;
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

    const nodeId = `audioplayer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const nodeName = this.params.nodeName ?? 'AudioPlayer';

    const node = new AudioPlayer({
      id: nodeId,
      name: nodeName,
      autoplay: false,
      loop: false,
      volume: 1,
      audioTrack: null,
    });

    const selectedParentAtInvoke = snapshot.selection.primaryNodeId;
    const targetParent = this.resolveParent(sceneGraph, selectedParentAtInvoke);
    attachNode(sceneGraph, node, targetParent);

    SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
    SceneStateUpdater.markSceneDirty(state, activeSceneId);
    SceneStateUpdater.selectNode(state, nodeId);

    return {
      didMutate: true,
      commit: {
        label: `Create ${nodeName}`,
        undo: () => {
          detachNode(sceneGraph, node, targetParent);
          SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
          SceneStateUpdater.markSceneDirty(state, activeSceneId);
          SceneStateUpdater.clearSelectionIfTargeted(state, nodeId);
        },
        redo: () => {
          attachNode(sceneGraph, node, targetParent);
          SceneStateUpdater.updateHierarchyState(state, activeSceneId, sceneGraph);
          SceneStateUpdater.markSceneDirty(state, activeSceneId);
          SceneStateUpdater.selectNode(state, nodeId);
        },
      },
    };
  }

  private resolveParent(
    sceneGraph: { nodeMap: Map<string, NodeBase> },
    selectedNodeId: string | null
  ): NodeBase | null {
    if (!selectedNodeId) {
      return null;
    }

    const selectedNode = sceneGraph.nodeMap.get(selectedNodeId) ?? null;
    if (!selectedNode || !selectedNode.isContainer) {
      return null;
    }

    return selectedNode;
  }
}
