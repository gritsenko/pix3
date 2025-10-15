import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { appState } from '@/state';
import { SceneManager } from '@/core/SceneManager';
import { SceneValidationError } from '@/core/SceneLoader';
import type { SceneGraph } from '@/core/SceneManager';
import { ResourceManager } from '@/services/ResourceManager';

export interface LoadSceneParams {
  filePath: string;
  sceneId?: string;
}

export class LoadSceneOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.load',
    title: 'Load Scene',
    description: 'Load a scene from disk into the editor',
    tags: ['scene', 'io'],
  };

  private readonly params: LoadSceneParams;

  constructor(params: LoadSceneParams) {
    this.params = params;
  }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { container } = context;
    const { filePath } = this.params;

    const resources = container.getService<ResourceManager>(
      container.getOrCreateToken(ResourceManager)
    );
    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );

    appState.scenes.loadState = 'loading';
    appState.scenes.loadError = null;

    try {
      const sceneText = await resources.readText(filePath);
      const graph = sceneManager.parseScene(sceneText, { filePath });

      const activeId = this.params.sceneId ?? appState.scenes.activeSceneId ?? 'startup-scene';
      const existing = appState.scenes.descriptors[activeId] ?? null;
      const sceneName = this.deriveSceneName(
        resources,
        filePath,
        graph.metadata ?? {},
        existing?.name
      );
      if (!existing) {
        appState.scenes.descriptors[activeId] = {
          id: activeId,
          filePath,
          name: sceneName,
          version: graph.version ?? '1.0.0',
          isDirty: false,
          lastSavedAt: null,
        };
        appState.scenes.activeSceneId = activeId;
      } else {
        appState.scenes.descriptors[activeId] = {
          ...existing,
          filePath,
          name: sceneName,
          version: graph.version ?? existing.version,
          isDirty: false,
        } as typeof existing;
        appState.scenes.activeSceneId = activeId;
      }

      sceneManager.setActiveSceneGraph(activeId, graph);

      appState.scenes.hierarchies[activeId] = {
        version: graph.version ?? null,
        description: graph.description ?? null,
        rootNodes: graph.rootNodes,
        metadata: graph.metadata ?? {},
      };
      appState.scenes.loadState = 'ready';
      appState.scenes.lastLoadedAt = Date.now();
      appState.scenes.pendingScenePaths = appState.scenes.pendingScenePaths.filter(
        p => p !== filePath
      );
      appState.project.lastOpenedScenePath = filePath;

      return { didMutate: true };
    } catch (error) {
      let message = 'Failed to load scene.';
      if (error instanceof SceneValidationError) {
        message = `${message} Validation issues: ${error.details.join('; ')}`;
      } else if (error instanceof Error) {
        message = `${message} ${error.message}`;
      }
      appState.scenes.loadState = 'error';
      appState.scenes.loadError = message;
      console.error('[LoadSceneOperation] Scene load failed:', error);
      return { didMutate: false };
    }
  }

  private deriveSceneName(
    resources: ResourceManager,
    filePath: string,
    metadata: SceneGraph['metadata'] | Record<string, unknown>,
    existingName?: string | null
  ): string {
    const preserved = typeof existingName === 'string' ? existingName.trim() : '';
    if (preserved) return preserved;

    const metaName = this.extractMetadataName(metadata);
    if (metaName) return metaName;

    const normalizedPath = resources.normalize(filePath).replace(/\\+/g, '/');
    const segments = normalizedPath.split('/').filter(Boolean);
    const basename = segments.length ? segments[segments.length - 1] : normalizedPath;
    const withoutExtension = basename.replace(/\.[^./]+$/i, '');
    const words = withoutExtension
      .split(/[^a-z0-9]+/i)
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1));
    return words.length ? words.join(' ') : 'Scene';
  }

  private extractMetadataName(metadata: SceneGraph['metadata'] | Record<string, unknown>): string {
    const candidates = [
      (metadata as Record<string, unknown>)?.name,
      (metadata as Record<string, unknown>)?.title,
      (metadata as Record<string, unknown>)?.displayName,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed) return trimmed;
      }
    }
    return '';
  }
}
