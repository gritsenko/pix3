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
      const kind: FileSystemHandleKind = rest.length > 0 ? 'directory' : entry.kind;
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
      this.normalizePath(path),
      appState.collaboration.shareToken ?? undefined
    );
    return response.text();
  }

  async readBlob(path: string): Promise<Blob> {
    if (this.getBackend() === 'local') {
      return this.fileSystem.readBlob(path);
    }

    const response = await ApiClient.downloadFile(
      this.requireProjectId(),
      this.normalizePath(path),
      appState.collaboration.shareToken ?? undefined
    );
    return response.blob();
  }

  async writeTextFile(path: string, contents: string): Promise<void> {
    if (this.getBackend() === 'local') {
      await this.fileSystem.writeTextFile(path, contents);
      return;
    }

    this.ensureWriteAllowed();
    await ApiClient.uploadFile(this.requireProjectId(), this.normalizePath(path), contents);
    await this.refreshManifest();
  }

  async writeBinaryFile(path: string, data: ArrayBuffer): Promise<void> {
    if (this.getBackend() === 'local') {
      await this.fileSystem.writeBinaryFile(path, data);
      return;
    }

    this.ensureWriteAllowed();
    await ApiClient.uploadFile(this.requireProjectId(), this.normalizePath(path), data);
    await this.refreshManifest();
  }

  async deleteEntry(path: string): Promise<void> {
    if (this.getBackend() === 'local') {
      await this.fileSystem.deleteEntry(path);
      return;
    }

    this.ensureWriteAllowed();
    await ApiClient.deleteFile(this.requireProjectId(), this.normalizePath(path));
    await this.refreshManifest();
  }

  async createDirectory(path: string): Promise<void> {
    if (this.getBackend() === 'local') {
      await this.fileSystem.createDirectory(path);
      return;
    }

    this.ensureWriteAllowed();
    await ApiClient.createDirectory(this.requireProjectId(), this.normalizePath(path));
    await this.refreshManifest();
  }

  async moveEntry(sourcePath: string, targetPath: string): Promise<void> {
    const normalizedSourcePath = this.normalizePath(sourcePath);
    const normalizedTargetPath = this.normalizePath(targetPath);

    if (normalizedSourcePath === normalizedTargetPath) {
      return;
    }

    const sourceEntry = await this.getEntryDescriptor(normalizedSourcePath);
    if (!sourceEntry) {
      throw new Error(`Source entry not found: ${sourcePath}`);
    }

    if (sourceEntry.kind === 'file') {
      const blob = await this.readBlob(normalizedSourcePath);
      await this.writeBinaryFile(normalizedTargetPath, await blob.arrayBuffer());
      await this.deleteEntry(normalizedSourcePath);
      return;
    }

    await this.copyDirectory(normalizedSourcePath, normalizedTargetPath);
    await this.deleteEntry(normalizedSourcePath);
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

    const { files } = await ApiClient.getManifestWithAccess(
      projectId,
      appState.collaboration.shareToken ?? undefined
    );
    this.cachedProjectId = projectId;
    this.cachedManifest = files;
    return files;
  }

  async refreshManifest(): Promise<void> {
    if (this.getBackend() === 'cloud') {
      await this.getManifestEntries(true);
    }
  }

  private async getEntryDescriptor(path: string): Promise<FileDescriptor | null> {
    const parentPath = this.getParentDirectory(path);
    const name = this.getBaseName(path);
    const entries = await this.listDirectory(parentPath);
    return entries.find(entry => entry.name === name) ?? null;
  }

  private async copyDirectory(sourcePath: string, targetPath: string): Promise<void> {
    await this.createDirectory(targetPath);
    const entries = await this.listDirectory(sourcePath);
    for (const entry of entries) {
      const childSourcePath = `${sourcePath}/${entry.name}`;
      const childTargetPath = `${targetPath}/${entry.name}`;
      if (entry.kind === 'directory') {
        await this.copyDirectory(childSourcePath, childTargetPath);
        continue;
      }

      const blob = await this.readBlob(childSourcePath);
      await this.writeBinaryFile(childTargetPath, await blob.arrayBuffer());
    }
  }

  private requireProjectId(): string {
    const projectId = appState.project.id;
    if (!projectId) {
      throw new Error('Project ID is not available.');
    }
    return projectId;
  }

  private ensureWriteAllowed(): void {
    if (appState.collaboration.isReadOnly) {
      throw new Error('Project is open in read-only collaboration mode.');
    }
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

  private getParentDirectory(path: string): string {
    if (!path || path === '.') {
      return '.';
    }

    const segments = path.split('/').filter(Boolean);
    if (segments.length <= 1) {
      return '.';
    }

    return segments.slice(0, -1).join('/');
  }

  private getBaseName(path: string): string {
    const segments = path.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? path;
  }
}

export const resolveProjectStorageService = (): ProjectStorageService =>
  ServiceContainer.getInstance().getService<ProjectStorageService>(
    ServiceContainer.getInstance().getOrCreateToken(ProjectStorageService)
  );
