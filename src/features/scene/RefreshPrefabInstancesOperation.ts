import { ref } from 'valtio/vanilla';
import { SceneManager } from '@pix3/runtime';

import { type Operation, type OperationContext, type OperationInvokeResult } from '@/core/Operation';

export interface RefreshPrefabInstancesOperationParams {
  sceneId: string;
  changedPrefabPath?: string;
}

export class RefreshPrefabInstancesOperation implements Operation<OperationInvokeResult> {
  readonly metadata = {
    id: 'scene.refresh-prefab-instances',
    title: 'Refresh Prefab Instances',
    description: 'Rebuild scene prefab instances from latest source assets',
    tags: ['scene', 'prefab', 'refresh'],
  } as const;

  private readonly params: RefreshPrefabInstancesOperationParams;

  constructor(params: RefreshPrefabInstancesOperationParams) {
    this.params = params;
  }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { state, container } = context;
    const sceneManager = container.getService<SceneManager>(container.getOrCreateToken(SceneManager));
    const { sceneId } = this.params;
    const descriptor = state.scenes.descriptors[sceneId];

    if (!descriptor) {
      return { didMutate: false };
    }

    const currentGraph = sceneManager.getSceneGraph(sceneId);
    if (!currentGraph) {
      return { didMutate: false };
    }

    if (!this.hasPrefabInstances(currentGraph)) {
      return { didMutate: false };
    }

    const changedPrefabPath = this.normalizePath(this.params.changedPrefabPath);
    if (changedPrefabPath && !this.referencesPrefabPath(currentGraph, changedPrefabPath)) {
      return { didMutate: false };
    }

    const preservedDirty = descriptor.isDirty;
    const preservedLastSavedAt = descriptor.lastSavedAt;
    const sceneText = sceneManager.serializeScene(currentGraph);
    const refreshedGraph = await sceneManager.parseScene(sceneText, {
      filePath: descriptor.filePath || undefined,
    });

    sceneManager.setActiveSceneGraph(sceneId, refreshedGraph);
    state.scenes.hierarchies[sceneId] = {
      version: refreshedGraph.version ?? null,
      description: refreshedGraph.description ?? null,
      rootNodes: ref(refreshedGraph.rootNodes),
      metadata: refreshedGraph.metadata ?? {},
    };

    descriptor.isDirty = preservedDirty;
    descriptor.lastSavedAt = preservedLastSavedAt;
    state.scenes.lastLoadedAt = Date.now();
    state.scenes.nodeDataChangeSignal = state.scenes.nodeDataChangeSignal + 1;

    return { didMutate: true };
  }

  private hasPrefabInstances(graph: { nodeMap: Map<string, { instancePath: string | null }> }): boolean {
    for (const node of graph.nodeMap.values()) {
      if (typeof node.instancePath === 'string' && node.instancePath.length > 0) {
        return true;
      }
    }
    return false;
  }

  private referencesPrefabPath(
    graph: { nodeMap: Map<string, { instancePath: string | null }> },
    changedPrefabPath: string
  ): boolean {
    for (const node of graph.nodeMap.values()) {
      if (!node.instancePath) {
        continue;
      }
      if (this.normalizePath(node.instancePath) === changedPrefabPath) {
        return true;
      }
    }
    return false;
  }

  private normalizePath(value?: string): string {
    if (!value) {
      return '';
    }
    return value.replace(/\\/g, '/');
  }
}
