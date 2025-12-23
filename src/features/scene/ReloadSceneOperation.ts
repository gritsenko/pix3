import { ResourceManager } from '@/services/ResourceManager';
import { SceneManager } from '@/core/SceneManager';
import { SceneValidationError } from '@/core/SceneLoader';
import { ref } from 'valtio/vanilla';
import { getAppStateSnapshot } from '@/state';
import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';

export interface ReloadSceneOperationParams {
  /** Scene ID to reload. */
  sceneId: string;
  /** File path to reload from. */
  filePath: string;
}

/**
 * ReloadSceneOperation reloads a scene from its file source.
 * Used when external file changes are detected.
 */
export class ReloadSceneOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'scene.reload',
    title: 'Reload Scene',
    description: 'Reload scene from file (triggered by external change)',
  };

  private readonly params: ReloadSceneOperationParams;

  constructor(params: ReloadSceneOperationParams) {
    this.params = params;
  }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { state, container } = context;
    const { sceneId, filePath } = this.params;

    const resourceManager = container.getService<ResourceManager>(
      container.getOrCreateToken(ResourceManager)
    );
    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );

    try {
      // Read and parse the scene from file
      const sceneText = await resourceManager.readText(filePath);
      
      // Log the content for debugging
      if (!sceneText || sceneText.trim().length === 0) {
        console.warn('[ReloadSceneOperation] Scene file is empty or contains only whitespace', {
          filePath,
          contentLength: sceneText?.length ?? 0,
        });
      }
      
      const graph = await sceneManager.parseScene(sceneText, { filePath });

      // Get current scene descriptor
      const descriptor = state.scenes.descriptors[sceneId];
      if (!descriptor) {
        throw new Error(`Scene descriptor not found: ${sceneId}`);
      }

      // Update scene manager with new graph
      sceneManager.setActiveSceneGraph(sceneId, graph);

      // Update state hierarchy
      state.scenes.hierarchies[sceneId] = {
        version: graph.version ?? null,
        description: graph.description ?? null,
        rootNodes: ref(graph.rootNodes),
        metadata: graph.metadata ?? {},
      };

      // Mark as not dirty since we just reloaded from source
      descriptor.isDirty = false;

      // Update modification time
      try {
        if (descriptor.fileHandle) {
          const file = await descriptor.fileHandle.getFile();
          descriptor.lastModifiedTime = file.lastModified;
        }
      } catch (error) {
        console.debug('[ReloadSceneOperation] Could not update modification time:', error);
      }

      state.scenes.loadState = 'ready';
      state.scenes.loadError = null;
      state.scenes.lastLoadedAt = Date.now();

      const beforeSnapshot = context.snapshot;
      const afterSnapshot = getAppStateSnapshot();

      return {
        didMutate: true,
        commit: {
          label: `Reload scene from file: ${filePath}`,
          beforeSnapshot,
          afterSnapshot,
          undo: () => {
            // For auto-reload, undo is not really applicable
            // Just restore the previous state snapshot
            Object.assign(state, beforeSnapshot);
          },
          redo: () => {
            Object.assign(state, afterSnapshot);
          },
        },
      };
    } catch (error) {
      let message = 'Failed to reload scene from file.';
      if (error instanceof SceneValidationError) {
        message = `${message} Validation issues: ${error.details.join('; ')}`;
      } else if (error instanceof Error) {
        message = `${message} ${error.message}`;
      }
      state.scenes.loadState = 'error';
      state.scenes.loadError = message;
      console.error('[ReloadSceneOperation] Reload failed:', error);
      throw error;
    }
  }
}
