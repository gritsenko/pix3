import { injectable, ServiceContainer } from '../fw/di';
import { resolveFileSystemAPIService, type FileDescriptor } from './FileSystemAPIService';
import { appState } from '../state';

const RECENTS_KEY = 'pix3.recentProjects:v1';

export interface RecentProjectEntry {
  readonly id?: string;
  readonly name: string;
  readonly lastOpenedAt: number;
}

@injectable()
export class ProjectService {
  private readonly fs = resolveFileSystemAPIService();

  constructor() {}

  getRecentProjects(): RecentProjectEntry[] {
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as RecentProjectEntry[];
      if (!Array.isArray(parsed)) return [];
      // ensure entries have timestamp and sort by lastOpenedAt desc
      return parsed
        .map(p => ({
          id: p.id,
          name: p.name,
          lastOpenedAt: typeof p.lastOpenedAt === 'number' ? p.lastOpenedAt : 0,
        }))
        .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
    } catch {
      return [];
    }
  }

  private saveRecentProjects(list: RecentProjectEntry[]): void {
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 10)));
    } catch {
      // ignore
    }
  }

  removeRecentProject(idOrName: { id?: string; name?: string }): void {
    try {
      const list = this.getRecentProjects();
      const filtered = list.filter(r => {
        if (idOrName.id) return r.id !== idOrName.id;
        if (idOrName.name) return r.name !== idOrName.name;
        return true;
      });
      this.saveRecentProjects(filtered);
      try {
        appState.project.recentProjects = filtered.map(r => r.name);
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
  }

  addRecentProject(entry: RecentProjectEntry): void {
    const list = this.getRecentProjects();
    const filtered = list.filter(r => (entry.id ? r.id !== entry.id : r.name !== entry.name));
    const toAdd: RecentProjectEntry = {
      id: entry.id,
      name: entry.name,
      lastOpenedAt: entry.lastOpenedAt ?? Date.now(),
    };
    filtered.unshift(toAdd);
    this.saveRecentProjects(filtered);
    // reflect recents into app state for UI subscriptions (store names as identifiers for now)
    try {
      appState.project.recentProjects = filtered.map(r => r.name);
    } catch {
      // ignore
    }
  }

  async openProjectViaPicker(): Promise<void> {
    try {
      const handle = await this.fs.requestProjectDirectory('readwrite');
      // try to persist the handle and associate it with a recent entry id
      // prefer secure randomUUID when available; otherwise fallback to timestamp-based id
      const hasRandomUUID =
        typeof crypto !== 'undefined' &&
        typeof (crypto as unknown as { randomUUID?: unknown }).randomUUID === 'function';
      const id = hasRandomUUID
        ? (crypto as unknown as { randomUUID: () => string }).randomUUID()
        : `handle-${Date.now()}`;

      appState.project.directoryHandle = handle;
      appState.project.projectName = handle.name ?? 'Untitled Project';
      appState.project.status = 'ready';
      appState.project.errorMessage = null;

      // save recent entry with id and persist handle to IndexedDB (best-effort)
      this.addRecentProject({
        id,
        name: appState.project.projectName ?? 'Untitled Project',
        lastOpenedAt: Date.now(),
      });
      this.saveHandleToIndexedDB(id, handle).catch(() => {
        // ignore persistence errors; fallback behavior remains functional
      });
    } catch (error) {
      // propagate error after recording state
      appState.project.status = 'error';
      appState.project.errorMessage =
        error instanceof Error ? error.message : String(error ?? 'Failed to open project');
      throw error;
    }
  }

  /**
   * Try to open a recent project using a previously persisted directory handle.
   * If the persisted handle is unavailable or permission is denied, fall back to showing the picker.
   */
  async openRecentProject(entry: RecentProjectEntry): Promise<void> {
    if (entry.id) {
      try {
        const handle = await this.getHandleFromIndexedDB(entry.id);
        if (handle) {
          // ensure we have permission and then activate project
          try {
            await this.fs.ensurePermission(handle, 'readwrite');
            this.fs.setProjectDirectory(handle);
            appState.project.directoryHandle = handle;
            appState.project.projectName = handle.name ?? entry.name;
            appState.project.status = 'ready';
            appState.project.errorMessage = null;
            // update timestamp in recents
            this.addRecentProject({
              id: entry.id,
              name: appState.project.projectName ?? entry.name,
              lastOpenedAt: Date.now(),
            });
            return;
          } catch {
            // permission problem - fall through to picker
          }
        }
      } catch {
        // retrieval error - fall back to picker
      }
    }

    // fallback to picker which will create a new persisted mapping
    await this.openProjectViaPicker();
  }

  private saveHandleToIndexedDB(id: string, handle: FileSystemDirectoryHandle): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open('pix3-file-handles', 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('handles')) {
            db.createObjectStore('handles', { keyPath: 'id' });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('handles', 'readwrite');
          const store = tx.objectStore('handles');
          // store structured-cloneable handle
          store.put({ id, handle });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error ?? new Error('IndexedDB transaction error'));
          };
        };
        req.onerror = () => reject(req.error ?? new Error('IndexedDB open error'));
      } catch (err) {
        reject(err);
      }
    });
  }

  private getHandleFromIndexedDB(id: string): Promise<FileSystemDirectoryHandle | null> {
    return new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open('pix3-file-handles', 1);
        req.onupgradeneeded = () => {
          // no existing DB; nothing to return
          req.transaction?.abort();
        };
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('handles')) {
            db.close();
            resolve(null);
            return;
          }
          const tx = db.transaction('handles', 'readonly');
          const store = tx.objectStore('handles');
          // store keys are strings; pass id directly
          const getReq = store.get(id);
          getReq.onsuccess = () => {
            const result = getReq.result as
              | { id: string; handle?: FileSystemDirectoryHandle }
              | undefined;
            db.close();
            resolve(result?.handle ?? null);
          };
          getReq.onerror = () => {
            db.close();
            reject(getReq.error ?? new Error('IndexedDB get error'));
          };
        };
        req.onerror = () => reject(req.error ?? new Error('IndexedDB open error'));
      } catch (err) {
        reject(err);
      }
    });
  }

  async listProjectRoot(): Promise<FileDescriptor[]> {
    if (!appState.project.directoryHandle) return [];
    try {
      return await this.fs.listDirectory('.');
    } catch {
      return [];
    }
  }

  async createDirectory(path: string): Promise<void> {
    try {
      await this.fs.createDirectory(path);
    } catch (err) {
      // rethrow or wrap if needed
      throw err;
    }
  }

  async writeFile(path: string, contents: string): Promise<void> {
    try {
      await this.fs.writeTextFile(path, contents);
    } catch (err) {
      throw err;
    }
  }
}

export const resolveProjectService = (): ProjectService => {
  return ServiceContainer.getInstance().getService(
    ServiceContainer.getInstance().getOrCreateToken(ProjectService)
  ) as ProjectService;
};
