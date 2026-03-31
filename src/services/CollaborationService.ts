import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { IndexeddbPersistence } from 'y-indexeddb';
import { injectable } from '@/fw/di';
import { appState } from '@/state';

export type CollabConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'synced';

export interface CollabUserInfo {
  name: string;
  color: string;
  selection: string[];
  cursor3d: { x: number; y: number; z: number } | null;
  cameraPosition: { x: number; y: number; z: number } | null;
  isTransforming: string | null;
}

@injectable()
export class CollaborationService {
  private provider: HocuspocusProvider | null = null;
  private ydoc: Y.Doc | null = null;
  private undoManager: Y.UndoManager | null = null;
  private idbProvider: IndexeddbPersistence | null = null;
  private statusListeners = new Set<(status: CollabConnectionStatus) => void>();

  connectionStatus: CollabConnectionStatus = 'disconnected';

  /** Flag to prevent echo loop: set to true when processing remote updates */
  isRemoteUpdate = false;

  connect(projectId: string, sceneId: string, userName: string, userColor: string): void {
    // Clean up any existing connection
    this.disconnect();

    this.ydoc = new Y.Doc();
    const roomName = `project:${projectId}:scene:${sceneId}`;
    appState.collaboration.roomName = roomName;
    appState.collaboration.remoteUsers = [];

    // 1. Local persistence (offline support)
    this.idbProvider = new IndexeddbPersistence(roomName, this.ydoc);
    this.idbProvider.on('synced', () => {
      console.log('[collab] Y.Doc restored from IndexedDB');
    });

    // 2. Server synchronization
    const wsUrl = import.meta.env.VITE_COLLAB_WS_URL || 'ws://localhost:4000';
    this.provider = new HocuspocusProvider({
      url: wsUrl,
      name: roomName,
      document: this.ydoc,
      token: 'pix3-collab',
      onStatus: ({ status }: { status: string }) => {
        this.setConnectionStatus(status as CollabConnectionStatus);
      },
      onSynced: () => {
        this.setConnectionStatus('synced');
      },
      onDisconnect: () => {
        this.setConnectionStatus('disconnected');
      },
    });

    // Set awareness (presence) data
    this.provider.awareness?.setLocalStateField('user', {
      name: userName,
      color: userColor,
      selection: [],
      cursor3d: null,
      cameraPosition: null,
      isTransforming: null,
    } satisfies CollabUserInfo);

    // Create UndoManager scoped to scene map
    const sceneMap = this.ydoc.getMap('scene');
    this.undoManager = new Y.UndoManager([sceneMap], {
      trackedOrigins: new Set([this.getLocalOrigin()]),
      captureTimeout: 500,
    });

    this.setConnectionStatus('connecting');
  }

  disconnect(): void {
    this.undoManager?.destroy();
    this.undoManager = null;

    this.provider?.destroy();
    this.provider = null;

    this.idbProvider?.destroy();
    this.idbProvider = null;

    this.ydoc?.destroy();
    this.ydoc = null;

    appState.collaboration.roomName = null;
    appState.collaboration.remoteUsers = [];
    this.setConnectionStatus('disconnected');
  }

  isConnected(): boolean {
    return this.connectionStatus === 'connected' || this.connectionStatus === 'synced';
  }

  getYDoc(): Y.Doc | null {
    return this.ydoc;
  }

  getAwareness(): HocuspocusProvider['awareness'] | null {
    return this.provider?.awareness ?? null;
  }

  getUndoManager(): Y.UndoManager | null {
    return this.undoManager;
  }

  getProvider(): HocuspocusProvider | null {
    return this.provider;
  }

  getLocalOrigin(): string {
    return 'pix3-local';
  }

  getServerBaseUrl(): string {
    return import.meta.env.VITE_COLLAB_HTTP_URL || 'http://localhost:4001';
  }

  addStatusListener(listener: (status: CollabConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  dispose(): void {
    this.disconnect();
    this.statusListeners.clear();
  }

  private setConnectionStatus(status: CollabConnectionStatus): void {
    this.connectionStatus = status;
    appState.collaboration.connectionStatus = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}
