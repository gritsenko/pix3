import { injectable, ServiceContainer } from '@/fw/di';
import { appState } from '@/state';
import { resolveFileSystemAPIService, type FileDescriptor } from './FileSystemAPIService';

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
    await this.fs.createDirectory(path);
  }

  async writeFile(path: string, contents: string): Promise<void> {
    await this.fs.writeTextFile(path, contents);
  }

  async writeBinaryFile(path: string, data: ArrayBuffer): Promise<void> {
    await this.fs.writeBinaryFile(path, data);
  }

  async deleteEntry(path: string): Promise<void> {
    await this.fs.deleteEntry(path);
  }

  listDirectory(path = '.'): Promise<FileDescriptor[]> {
    return this.fs.listDirectory(path);
  }

  async moveItem(sourcePath: string, targetPath: string): Promise<void> {
    // Move operation: copy then delete
    // For now, we'll use FileSystemAPI's move capability if available
    // Otherwise, we'll implement via copy + delete (for files) or recursive copy + delete (for directories)
    try {
      // Get the source and target parent directory names and handles
      const sourceName = sourcePath.split('/').pop();
      const targetName = targetPath.split('/').pop();

      if (!sourceName || !targetName) {
        throw new Error('Invalid source or target path');
      }

      // Use the filesystem API to move (copy + delete or native move if available)
      await this.fs.moveEntry(sourcePath, targetPath);
    } catch (error) {
      console.error('[ProjectService] Error moving item:', error);
      throw error;
    }
  }

  async createNewProject(): Promise<void> {
    try {
      const handle = await this.fs.requestProjectDirectory('readwrite');

      // Check if directory is empty
      const entries = await this.fs.listDirectory('.');
      if (entries.length > 0) {
        throw new Error(
          'Selected folder is not empty. Please choose an empty folder for a new project.'
        );
      }

      // Create base project structure
      await this.createProjectStructure();

      // Set up project state
      const hasRandomUUID =
        typeof crypto !== 'undefined' &&
        typeof (crypto as unknown as { randomUUID?: unknown }).randomUUID === 'function';
      const id = hasRandomUUID
        ? (crypto as unknown as { randomUUID: () => string }).randomUUID()
        : `handle-${Date.now()}`;

      appState.project.directoryHandle = handle;
      appState.project.projectName = handle.name ?? 'New Project';
      appState.project.status = 'ready';
      appState.project.errorMessage = null;

      // Save to recent projects
      this.addRecentProject({
        id,
        name: appState.project.projectName ?? 'New Project',
        lastOpenedAt: Date.now(),
      });
      this.saveHandleToIndexedDB(id, handle).catch(() => {
        // ignore persistence errors; fallback behavior remains functional
      });
    } catch (error) {
      // Propagate error after recording state
      appState.project.status = 'error';
      appState.project.errorMessage =
        error instanceof Error ? error.message : String(error ?? 'Failed to create new project');
      throw error;
    }
  }

  private async createProjectStructure(): Promise<void> {
    const directories = [
      'src',
      'src/scripts',
      'src/assets',
      'src/assets/scenes',
      'src/assets/models',
      'src/assets/textures',
    ];

    // Create directories
    for (const dir of directories) {
      await this.fs.createDirectory(dir);
    }

    // Create README.md
    const readmeContent = `# Pix3 Project

This is a new Pix3 project created on ${new Date().toLocaleDateString()}.

## Project Structure

- \`src/\` - Source code
- \`src/scripts/\` - Custom scripts and behaviors
- \`src/assets/\` - Project assets
- \`src/assets/scenes/\` - Scene files
- \`src/assets/models/\` - 3D models
- \`src/assets/textures/\` - Texture files

## Getting Started

1. Add your 3D models to \`src/assets/models/\`
2. Create scenes in \`src/assets/scenes/\`
3. Write custom scripts in \`src/scripts/\`
4. Open your project in Pix3 to start editing

Happy creating! 🎨
`;

    await this.fs.writeTextFile('README.md', readmeContent);
  }
}

export const resolveProjectService = (): ProjectService => {
  return ServiceContainer.getInstance().getService(
    ServiceContainer.getInstance().getOrCreateToken(ProjectService)
  ) as ProjectService;
};
