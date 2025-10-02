import { snapshot } from 'valtio/vanilla';

import { injectable, inject } from '@/fw/di';
import { appState } from '@/state';
import { SceneManager } from '@/core/scene/SceneManager';
import { SceneValidationError } from '@/core/scene/SceneLoader';
import type { SceneGraph } from '@/core/scene/types';
import { ResourceManager } from '@/services/ResourceManager';

export interface LoadSceneCommandParams {
  filePath: string; // res:// path
  sceneId?: string; // optional override id
}

export interface CommandResult<TUndo = unknown> {
  undo?: TUndo;
}

@injectable()
export class LoadSceneCommand {
  @inject(ResourceManager) private readonly resources!: ResourceManager;
  @inject(SceneManager) private readonly sceneManager!: SceneManager;

  async execute(params: LoadSceneCommandParams): Promise<CommandResult> {
    const { filePath } = params;

    appState.scenes.loadState = 'loading';
    appState.scenes.loadError = null;

    try {
      const sceneText = await this.resources.readText(filePath);
      const graph = this.sceneManager.parseScene(sceneText, { filePath });

      const current = snapshot(appState.scenes);
      const activeId = params.sceneId ?? current.activeSceneId ?? 'startup-scene';
      const existing = current.descriptors[activeId];
      const sceneName = this.deriveSceneName(filePath, graph.metadata ?? {}, existing?.name);
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
        };
        appState.scenes.activeSceneId = activeId;
      }

      this.sceneManager.setActiveSceneGraph(activeId, graph);

      // Store the actual NodeBase instances directly
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
    } catch (error) {
      let message = 'Failed to load scene.';
      if (error instanceof SceneValidationError) {
        message = `${message} Validation issues: ${error.details.join('; ')}`;
      } else if (error instanceof Error) {
        message = `${message} ${error.message}`;
      }
      appState.scenes.loadState = 'error';
      appState.scenes.loadError = message;
      console.error('[LoadSceneCommand] Scene load failed:', error);
    }

    return {};
  }

  private deriveSceneName(
    filePath: string,
    metadata: SceneGraph['metadata'] | Record<string, unknown>,
    existingName?: string | null
  ): string {
    const preserved = typeof existingName === 'string' ? existingName.trim() : '';
    if (preserved) {
      return preserved;
    }

    const metaName = this.extractMetadataName(metadata);
    if (metaName) {
      return metaName;
    }

    const normalizedPath = this.resources.normalize(filePath).replace(/\\+/g, '/');
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
        if (trimmed) {
          return trimmed;
        }
      }
    }

    return '';
  }
}
