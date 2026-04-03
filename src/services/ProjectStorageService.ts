import { injectable, inject } from '@/fw/di';
import { ServiceContainer } from '@/fw/di';
import { appState } from '@/state';
import { FileSystemAPIService, type FileDescriptor } from './FileSystemAPIService';
import * as ApiClient from './ApiClient';

type CloudManifestEntry = ApiClient.ManifestEntry;

@injectable()
export class ProjectStorageService {
  @inject(FileSystemAPIService)
  private readonly fileSystem!: FileSystemAPIService;

  private cachedProjectId: string | null = null;
  private cachedManifest: CloudManifestEntry[] | null = null;

  getBackend(): 'local' | 'cloud' {
    return appState.project.backend;
  }

  async listDirectory(path = '.'): Promise<FileDescriptor[]> {
    if (this.getBackend() === 'local') {
      return this.fileSystem.listDirectory(path);
    }

    const normalizedPath = this.normalizePath(path);
    const manifest = await this.getManifestEntries();
    const entries = new Map<string, FileDescriptor>();

    for (const entry of manifest) {
      const relative = this.getRelativeToDirectory(entry.path, normalizedPath);
      if (!relative) {
        continue;
      }

      const [head, ...rest] = relative.split('/');
      if (!head) {
        continue;
      }

      const childPath = normalizedPath === '.' ? head : `${normalizedPath}/${head}`;
      const kind: FileSystemHandleKind = rest.length > 0 ? 'directory' : 'file';
      const existing = entries.get(childPath);

      if (!existing || existing.kind === 'file') {
        entries.set(childPath, {
          name: head,
          kind,
          path: childPath,
        });
      }
    }

    return Array.from(entries.values());
  }

  async readTextFile(path: string): Promise<string> {
    if (this.getBackend() === 'local') {
      return this.fileSystem.readTextFile(path);
    }

    const response = await ApiClient.downloadFile(
      this.requireProjectId(),
      this.normalizePath(path)
    );
    return response.text();
  }

  async readBlob(path: string): Promise<Blob> {
    if (this.getBackend() === 'local') {
      return this.fileSystem.readBlob(path);
    }

    const response = await ApiClient.downloadFile(
      this.requireProjectId(),
      this.normalizePath(path)
    );
    return response.blob();
  }

  async writeTextFile(path: string, contents: string): Promise<void> {
    if (this.getBackend() === 'local') {
      await this.fileSystem.writeTextFile(path, contents);
      return;
    }

    await ApiClient.uploadFile(this.requireProjectId(), this.normalizePath(path), contents);
    await this.refreshManifest();
  }

  async writeBinaryFile(path: string, data: ArrayBuffer): Promise<void> {
    if (this.getBackend() === 'local') {
      await this.fileSystem.writeBinaryFile(path, data);
      return;
    }

    await ApiClient.uploadFile(this.requireProjectId(), this.normalizePath(path), data);
    await this.refreshManifest();
  }

  async deleteEntry(path: string): Promise<void> {
    if (this.getBackend() === 'local') {
      await this.fileSystem.deleteEntry(path);
      return;
    }

    await ApiClient.deleteFile(this.requireProjectId(), this.normalizePath(path));
    await this.refreshManifest();
  }

  async createDirectory(path: string): Promise<void> {
    if (this.getBackend() === 'local') {
      await this.fileSystem.createDirectory(path);
    }
  }

  async getFileHandle(path: string): Promise<FileSystemFileHandle | null> {
    if (this.getBackend() === 'local') {
      return this.fileSystem.getFileHandle(path);
    }
    void path;
    return null;
  }

  async getLastModified(path: string): Promise<number | null> {
    if (this.getBackend() === 'local') {
      const fileHandle = await this.fileSystem.getFileHandle(path);
      const file = await fileHandle.getFile();
      return file.lastModified;
    }

    const normalizedPath = this.normalizePath(path);
    const manifest = await this.getManifestEntries();
    const entry = manifest.find(item => item.path === normalizedPath);
    if (!entry) {
      return null;
    }

    const parsed = Date.parse(entry.modified);
    return Number.isNaN(parsed) ? null : parsed;
  }

  normalizeResourcePath(path: string): string {
    if (this.getBackend() === 'local') {
      return this.fileSystem.normalizeResourcePath(path);
    }
    return this.normalizePath(path);
  }

  async getManifestEntries(forceRefresh = false): Promise<CloudManifestEntry[]> {
    if (this.getBackend() === 'local') {
      return [];
    }

    const projectId = this.requireProjectId();
    if (!forceRefresh && this.cachedManifest && this.cachedProjectId === projectId) {
      return this.cachedManifest;
    }

    const { files } = await ApiClient.getManifest(projectId);
    this.cachedProjectId = projectId;
    this.cachedManifest = files;
    return files;
  }

  async refreshManifest(): Promise<void> {
    if (this.getBackend() === 'cloud') {
      await this.getManifestEntries(true);
    }
  }

  private requireProjectId(): string {
    const projectId = appState.project.id;
    if (!projectId) {
      throw new Error('Project ID is not available.');
    }
    return projectId;
  }

  private normalizePath(path: string): string {
    if (!path || path === '.') {
      return '.';
    }

    return (
      path
        .replace(/^res:\/\//i, '')
        .replace(/^\.\/+/, '')
        .replace(/^\/+/, '')
        .replace(/\/+$/, '')
        .replace(/\\+/g, '/') || '.'
    );
  }

  private getRelativeToDirectory(filePath: string, directoryPath: string): string | null {
    if (directoryPath === '.') {
      return filePath;
    }

    if (filePath === directoryPath) {
      return '';
    }

    if (!filePath.startsWith(`${directoryPath}/`)) {
      return null;
    }

    return filePath.slice(directoryPath.length + 1);
  }
}

export const resolveProjectStorageService = (): ProjectStorageService =>
  ServiceContainer.getInstance().getService<ProjectStorageService>(
    ServiceContainer.getInstance().getOrCreateToken(ProjectStorageService)
  );
