import { injectable, inject } from '@/fw/di';
import { SceneLoader, type ParseSceneOptions } from './SceneLoader';
import type { SceneGraph } from './types';

@injectable()
export class SceneManager {
  @inject(SceneLoader) private readonly sceneLoader!: SceneLoader;

  private readonly sceneGraphs = new Map<string, SceneGraph>();
  private activeSceneId: string | null = null;

  constructor() {}

  parseScene(sceneText: string, options: ParseSceneOptions = {}): SceneGraph {
    return this.sceneLoader.parseScene(sceneText, options);
  }

  setActiveSceneGraph(sceneId: string, graph: SceneGraph): void {
    this.sceneGraphs.set(sceneId, graph);
    this.activeSceneId = sceneId;
    // Debug logging to help trace when scenes are registered as active
    if (process.env.NODE_ENV === 'development') {
      console.debug('[SceneManager] setActiveSceneGraph', {
        sceneId,
        rootCount: graph.rootNodes.length,
      });
    }
  }

  getSceneGraph(sceneId: string): SceneGraph | null {
    const graph = this.sceneGraphs.get(sceneId) ?? null;

    return graph;
  }

  getActiveSceneGraph(): SceneGraph | null {
    if (!this.activeSceneId) {
      return null;
    }
    const graph = this.sceneGraphs.get(this.activeSceneId) ?? null;

    return graph;
  }

  removeSceneGraph(sceneId: string): void {
    this.sceneGraphs.delete(sceneId);
    if (this.activeSceneId === sceneId) {
      this.activeSceneId = null;
    }
  }

  dispose(): void {
    this.sceneGraphs.clear();
    this.activeSceneId = null;
  }
}
