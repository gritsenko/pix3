import type { SceneGraph } from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import type { AppState } from '@/state';
import { ServiceContainer } from '@/fw/di';
import { SceneStateUpdater } from './SceneStateUpdater';

export abstract class CreateNodeOperationBase<TParams> {
  protected abstract getMetadataId(): string;
  protected abstract getMetadataTitle(): string;
  protected abstract getMetadataDescription(): string;
  protected abstract getMetadataTags(): string[];
  protected abstract getNodeTypeName(): string;
  protected abstract createNode(params: TParams, nodeId: string): SceneGraph['rootNodes'][0];

  constructor(protected readonly params: TParams = {} as TParams) {}

  protected getNodeIdPrefix(): string {
    return this.getNodeTypeName()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-');
  }

  protected generateNodeId(): string {
    const prefix = this.getNodeIdPrefix();
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  protected getNodeName(): string {
    return this.getNodeTypeName();
  }

  async perform(context: { state: AppState; container: ServiceContainer }, sceneId: string) {
    const { state, container } = context;

    if (!sceneId) {
      return { didMutate: false };
    }

    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );

    if (!sceneManager) {
      return { didMutate: false };
    }

    const sceneGraph = sceneManager.getSceneGraph(sceneId);
    if (!sceneGraph) {
      return { didMutate: false };
    }

    const nodeId = this.generateNodeId();
    const node = this.createNode(this.params, nodeId);

    sceneGraph.rootNodes.push(node);
    sceneGraph.nodeMap.set(nodeId, node);

    SceneStateUpdater.updateHierarchyState(state, sceneId, sceneGraph);
    SceneStateUpdater.markSceneDirty(state, sceneId);
    SceneStateUpdater.selectNode(state, nodeId);

    const nodeName = this.getNodeName();

    return {
      didMutate: true,
      commit: {
        label: `Create ${nodeName}`,
        undo: () => {
          sceneGraph.rootNodes = sceneGraph.rootNodes.filter(
            (n: { nodeId: string }) => n.nodeId !== nodeId
          );
          sceneGraph.nodeMap.delete(nodeId);

          SceneStateUpdater.updateHierarchyState(state, sceneId, sceneGraph);
          SceneStateUpdater.markSceneDirty(state, sceneId);
          SceneStateUpdater.clearSelectionIfTargeted(state, nodeId);
        },
        redo: () => {
          sceneGraph.rootNodes.push(node);
          sceneGraph.nodeMap.set(nodeId, node);
          SceneStateUpdater.updateHierarchyState(state, sceneId, sceneGraph);
          SceneStateUpdater.markSceneDirty(state, sceneId);
          SceneStateUpdater.selectNode(state, nodeId);
        },
      },
    };
  }
}
