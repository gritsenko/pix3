import { injectable, ServiceContainer } from '@/fw/di';
import { appState } from '@/state';
import { SceneManager } from '@pix3/runtime';
import { CollaborationService } from './CollaborationService';
import { OperationService } from './OperationService';
import { SceneCRDTBinding } from './SceneCRDTBinding';

const HOST_COLOR = '#ffcf33';

@injectable()
export class CollabSessionService {
  async shareActiveScene(): Promise<string> {
    const projectId = appState.project.id;
    const sceneId = appState.scenes.activeSceneId;

    if (!projectId || !sceneId) {
      throw new Error('Open a project and scene before sharing.');
    }

    const container = ServiceContainer.getInstance();
    const collabService = container.getService<CollaborationService>(
      container.getOrCreateToken(CollaborationService)
    );
    const binding = container.getService<SceneCRDTBinding>(
      container.getOrCreateToken(SceneCRDTBinding)
    );
    const operationService = container.getService<OperationService>(
      container.getOrCreateToken(OperationService)
    );
    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );

    const roomName = `project:${projectId}:scene:${sceneId}`;
    const existingRoomName = appState.collaboration.roomName;

    if (!collabService.isConnected() || existingRoomName !== roomName) {
      collabService.connect(projectId, sceneId, this.getHostName(), HOST_COLOR);
      await this.waitForSync(collabService);
    }

    const ydoc = collabService.getYDoc();
    if (!ydoc) {
      throw new Error('Collaboration document is unavailable.');
    }

    binding.bindToOperationService(operationService, collabService);
    binding.bindToYDoc(ydoc, sceneId);

    const sceneGraph = sceneManager.getSceneGraph(sceneId) ?? sceneManager.getActiveSceneGraph();
    if (!sceneGraph) {
      throw new Error('Active scene graph is unavailable.');
    }

    const sceneMap = ydoc.getMap('scene');
    const snapshot = sceneMap.get('snapshot');
    if (typeof snapshot !== 'string' || !snapshot.trim()) {
      ydoc.transact(() => {
        binding.initializeYDocFromScene(ydoc, sceneGraph);
      }, collabService.getLocalOrigin());
    }

    return this.buildInviteLink(projectId, sceneId);
  }

  buildInviteLink(projectId: string, sceneId: string): string {
    const url = new URL(window.location.href);
    url.searchParams.set('collab', projectId);
    url.searchParams.set('scene', sceneId);
    url.hash = 'editor';
    return url.toString();
  }

  private getHostName(): string {
    const projectName = appState.project.projectName?.trim();
    if (projectName) {
      return `${projectName} Host`;
    }
    return 'Pix3 Host';
  }

  private waitForSync(collabService: CollaborationService): Promise<void> {
    return new Promise((resolve, reject) => {
      if (collabService.connectionStatus === 'synced') {
        resolve();
        return;
      }

      const timeoutId = window.setTimeout(() => {
        unsubscribe();
        resolve();
      }, 15000);

      const unsubscribe = collabService.addStatusListener(status => {
        if (status === 'synced') {
          window.clearTimeout(timeoutId);
          unsubscribe();
          resolve();
        } else if (status === 'disconnected') {
          window.clearTimeout(timeoutId);
          unsubscribe();
          reject(new Error('Unable to connect to the collaboration server.'));
        }
      });
    });
  }
}
