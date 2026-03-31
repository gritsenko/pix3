import { injectable, ServiceContainer } from '@/fw/di';
import { appState } from '@/state';
import { CollaborationService } from './CollaborationService';
import { SceneCRDTBinding } from './SceneCRDTBinding';
import { OperationService } from './OperationService';
import { ProjectService } from './ProjectService';
import { resolveFileSystemAPIService } from './FileSystemAPIService';
import { createDefaultProjectManifest } from '@/core/ProjectManifest';
import { SceneManager, type SceneGraph } from '@pix3/runtime';
import { ref } from 'valtio/vanilla';
import { stringify } from 'yaml';

export interface CollabJoinParams {
  projectId: string;
  sceneId: string;
}

const USER_COLORS = [
  '#e57373',
  '#f06292',
  '#ba68c8',
  '#9575cd',
  '#7986cb',
  '#64b5f6',
  '#4fc3f7',
  '#4dd0e1',
  '#4db6ac',
  '#81c784',
  '#aed581',
  '#dce775',
  '#fff176',
  '#ffd54f',
  '#ffb74d',
  '#ff8a65',
];

const COLLAB_SCENE_DIRECTORY = 'src/assets/scenes';

/**
 * Check the current URL for collab join parameters.
 * Returns the params if found, null otherwise.
 */
export function detectCollabJoinParams(): CollabJoinParams | null {
  try {
    const url = new URL(window.location.href);
    const projectId = url.searchParams.get('collab');
    const sceneId = url.searchParams.get('scene');
    if (projectId && sceneId) {
      return { projectId, sceneId };
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Detects collab join URL parameters and orchestrates the guest join flow:
 * 1. Parse `?collab=<projectId>&scene=<sceneId>` from the URL
 * 2. Set project state to 'ready' (no local directory needed for collab guests)
 * 3. Connect to the collab server
 * 4. Wait for Y.Doc sync from the server
 * 5. Build the scene graph from Y.Doc and inject it into the editor
 */
@injectable()
export class CollabJoinService {
  /**
   * Execute the full collab join flow.
   * Returns true if the join was initiated, false if params weren't found.
   */
  async joinSession(params: CollabJoinParams): Promise<boolean> {
    const { projectId, sceneId } = params;
    const userName = `Guest ${Math.floor(Math.random() * 1000)}`;
    const userColor = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];

    console.log('[CollabJoin] Joining collaborative session', { projectId, sceneId, userName });

    // 1. Set lightweight project metadata before we hydrate a local project folder.
    appState.project.id = projectId;
    appState.project.projectName = `Collab: ${projectId.substring(0, 8)}…`;
    appState.project.errorMessage = null;
    appState.project.manifest = null;

    // 2. Connect to the collab server
    const container = ServiceContainer.getInstance();
    const collabService = container.getService<CollaborationService>(
      container.getOrCreateToken(CollaborationService)
    );
    collabService.connect(projectId, sceneId, userName, userColor);

    // 3. Wait for Y.Doc sync from the server
    await this.waitForSync(collabService);

    // 4. Sync the shared snapshot into a local project folder first.
    const ydoc = collabService.getYDoc();
    if (!ydoc) {
      console.error('[CollabJoin] No Y.Doc available after sync');
      return false;
    }

    const crdtBinding = container.getService<SceneCRDTBinding>(
      container.getOrCreateToken(SceneCRDTBinding)
    );
    const operationService = container.getService<OperationService>(
      container.getOrCreateToken(OperationService)
    );
    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );

    const sceneSnapshot = this.getSceneSnapshot(ydoc);
    const syncedProject = await this.syncProjectToLocalFolder(projectId, sceneId, sceneSnapshot);

    // 5. Build scene graph from Y.Doc and inject it into the editor.
    const sceneGraph = await crdtBinding.buildSceneFromYDoc(ydoc);
    this.injectSceneIntoEditor(
      sceneId,
      sceneGraph,
      sceneManager,
      syncedProject.sceneFilePath,
      syncedProject.fileHandle
    );

    // NOW set project status to 'ready' — this triggers layout initialization,
    // script compilation guard, and tab restoration. By this point the scene
    // descriptor and tabs are already in appState so activateSceneTab will see
    // the scene as alreadyLoaded.
    appState.project.status = 'ready';

    // 6. Set up CRDT binding for ongoing sync
    crdtBinding.bindToOperationService(operationService, collabService);
    crdtBinding.bindToYDoc(ydoc, sceneId);

    // 7. Clean the URL to prevent re-joining on reload
    try {
      const cleanUrl = window.location.origin + window.location.pathname + '#editor';
      history.replaceState(null, '', cleanUrl);
    } catch {
      // ignore
    }

    console.log('[CollabJoin] Successfully joined collaborative session', {
      projectId,
      sceneId,
      nodeCount: sceneGraph.nodeMap.size,
    });

    return true;
  }

  private getSceneSnapshot(ydoc: import('yjs').Doc): string {
    const snapshot = ydoc.getMap('scene').get('snapshot');
    if (typeof snapshot === 'string' && snapshot.trim()) {
      return snapshot;
    }

    return `version: 1.0.0\ndescription: Collaborative Scene\nroot: []\n`;
  }

  /**
   * Wait for the HocuspocusProvider to report 'synced' status.
   * Times out after 15 seconds.
   */
  private waitForSync(collabService: CollaborationService): Promise<void> {
    return new Promise((resolve, reject) => {
      // Already synced?
      if (collabService.connectionStatus === 'synced') {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        cleanup();
        // Even if not fully synced, try to proceed with whatever we have
        console.warn('[CollabJoin] Sync timed out after 15s, proceeding with available data');
        resolve();
      }, 15_000);

      const cleanup = collabService.addStatusListener(status => {
        if (status === 'synced') {
          clearTimeout(timeout);
          cleanup();
          resolve();
        } else if (status === 'disconnected') {
          clearTimeout(timeout);
          cleanup();
          reject(new Error('Disconnected from collab server'));
        }
      });
    });
  }

  /**
   * Inject a scene graph into the editor state, mirroring what LoadSceneCommand does.
   */
  private injectSceneIntoEditor(
    sceneId: string,
    sceneGraph: SceneGraph,
    sceneManager: SceneManager,
    sceneFilePath: string,
    fileHandle: FileSystemFileHandle | null
  ): void {
    // Register scene in SceneManager
    sceneManager.setActiveSceneGraph(sceneId, sceneGraph);

    // Create scene descriptor (no file handle for collab guests)
    appState.scenes.descriptors[sceneId] = {
      id: sceneId,
      filePath: sceneFilePath,
      name: sceneGraph.description || sceneId,
      version: sceneGraph.version ?? '1.0.0',
      isDirty: false,
      lastSavedAt: null,
      fileHandle: fileHandle ? ref(fileHandle) : null,
      lastModifiedTime: null,
    };

    // Store hierarchy for UI (wrapped in ref() to prevent Valtio proxying of Three.js nodes)
    appState.scenes.hierarchies[sceneId] = {
      version: sceneGraph.version ?? null,
      description: sceneGraph.description ?? null,
      rootNodes: ref(sceneGraph.rootNodes),
      metadata: sceneGraph.metadata ?? {},
    };

    appState.scenes.activeSceneId = sceneId;
    appState.scenes.loadState = 'ready';
    appState.scenes.lastLoadedAt = Date.now();
    appState.project.lastOpenedScenePath = sceneFilePath;

    // Create an editor tab for the scene
    appState.tabs.tabs = [
      {
        id: `scene:${sceneFilePath}`,
        type: 'scene',
        resourceId: sceneFilePath,
        title: sceneGraph.description || 'Collab Scene',
        isDirty: false,
        contextState: {},
      },
    ];
    appState.tabs.activeTabId = `scene:${sceneFilePath}`;
  }

  private async syncProjectToLocalFolder(
    projectId: string,
    sceneId: string,
    sceneSnapshot: string
  ): Promise<{ sceneFilePath: string; fileHandle: FileSystemFileHandle | null }> {
    const projectName = `Collab: ${projectId.substring(0, 8)}…`;
    const projectService = this.getProjectService();
    const fileSystem = resolveFileSystemAPIService();
    const handle = await fileSystem.requestProjectDirectory('readwrite');

    fileSystem.setProjectDirectory(handle);

    appState.project.id = projectId;
    appState.project.directoryHandle = handle;
    appState.project.projectName = handle.name || projectName;
    appState.project.localAbsolutePath = null;
    appState.project.errorMessage = null;

    await projectService.createDirectory('src');
    await projectService.createDirectory('scripts');
    await projectService.createDirectory('src/assets');
    await projectService.createDirectory(COLLAB_SCENE_DIRECTORY);

    const manifest = createDefaultProjectManifest();
    await projectService.writeFile('pix3project.yaml', stringify(manifest, { indent: 2 }));
    appState.project.manifest = manifest;

    const sceneFileName = `${this.sanitizeSceneFileName(sceneId)}.pix3scene`;
    const relativeScenePath = `${COLLAB_SCENE_DIRECTORY}/${sceneFileName}`;
    await projectService.writeFile(relativeScenePath, sceneSnapshot);

    const fileHandle = await fileSystem
      .getFileHandle(relativeScenePath, { mode: 'readwrite' })
      .catch(() => null);

    projectService.addRecentProject({
      id: projectId,
      name: appState.project.projectName ?? projectName,
      lastOpenedAt: Date.now(),
    });

    return {
      sceneFilePath: `res://${relativeScenePath}`,
      fileHandle,
    };
  }

  private sanitizeSceneFileName(sceneId: string): string {
    const trimmed = sceneId.trim();
    if (!trimmed) {
      return 'collab-scene';
    }

    return trimmed.replace(/[^a-zA-Z0-9._-]+/g, '-');
  }

  private getProjectService(): ProjectService {
    const container = ServiceContainer.getInstance();
    return container.getService<ProjectService>(container.getOrCreateToken(ProjectService));
  }

  dispose(): void {
    // nothing to clean up
  }
}
