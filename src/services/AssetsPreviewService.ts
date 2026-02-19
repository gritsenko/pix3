import { injectable } from '@/fw/di';
import { subscribe } from 'valtio/vanilla';
import { appState } from '@/state';
import { resolveFileSystemAPIService } from './FileSystemAPIService';
import { resolveProjectService } from './ProjectService';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

export type AssetPreviewType = 'image' | 'icon';

export interface AssetPreviewItem {
  readonly name: string;
  readonly path: string;
  readonly kind: FileSystemHandleKind;
  readonly previewType: AssetPreviewType;
  readonly thumbnailUrl: string | null;
  readonly iconName: string;
  readonly extension: string;
}

export interface AssetsPreviewSnapshot {
  readonly selectedFolderPath: string | null;
  readonly displayPath: string;
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly items: readonly AssetPreviewItem[];
}

type AssetsPreviewListener = (snapshot: AssetsPreviewSnapshot) => void;

@injectable()
export class AssetsPreviewService {
  private readonly projectService = resolveProjectService();
  private readonly fileSystemService = resolveFileSystemAPIService();
  private readonly listeners = new Set<AssetsPreviewListener>();
  private readonly objectUrls = new Set<string>();
  private readonly state: {
    selectedFolderPath: string | null;
    displayPath: string;
    isLoading: boolean;
    errorMessage: string | null;
    items: AssetPreviewItem[];
  } = {
    selectedFolderPath: null,
    displayPath: 'res://',
    isLoading: false,
    errorMessage: null,
    items: [],
  };

  private requestVersion = 0;
  private disposeProjectSubscription?: () => void;

  constructor() {
    this.disposeProjectSubscription = subscribe(appState.project, () => {
      this.handleProjectStateChange();
    });
    this.handleProjectStateChange();
  }

  public subscribe(listener: AssetsPreviewListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  public getSnapshot(): AssetsPreviewSnapshot {
    return {
      selectedFolderPath: this.state.selectedFolderPath,
      displayPath: this.state.displayPath,
      isLoading: this.state.isLoading,
      errorMessage: this.state.errorMessage,
      items: this.state.items,
    };
  }

  public async syncFromAssetSelection(path: string, kind: FileSystemHandleKind): Promise<void> {
    if (appState.project.status !== 'ready') {
      return;
    }

    const selectedFolderPath = kind === 'directory' ? this.normalizePath(path) : this.getParentPath(path);
    await this.setSelectedFolder(selectedFolderPath);
  }

  public async refreshCurrentFolder(): Promise<void> {
    if (!this.state.selectedFolderPath) {
      return;
    }
    await this.loadFolder(this.state.selectedFolderPath);
  }

  public dispose(): void {
    this.disposeProjectSubscription?.();
    this.disposeProjectSubscription = undefined;
    this.clearObjectUrls();
    this.listeners.clear();
  }

  private handleProjectStateChange(): void {
    if (appState.project.status !== 'ready') {
      this.requestVersion += 1;
      this.clearObjectUrls();
      this.state.selectedFolderPath = null;
      this.state.displayPath = 'res://';
      this.state.errorMessage = null;
      this.state.items = [];
      this.state.isLoading = false;
      this.notify();
      return;
    }

    if (!this.state.selectedFolderPath) {
      void this.setSelectedFolder('.');
      return;
    }

    const modifiedDirectory = appState.project.lastModifiedDirectoryPath;
    if (modifiedDirectory && this.shouldRefreshForDirectory(modifiedDirectory)) {
      void this.refreshCurrentFolder();
    }
  }

  private shouldRefreshForDirectory(modifiedDirectory: string): boolean {
    if (!this.state.selectedFolderPath) {
      return false;
    }

    const currentPath = this.normalizePath(this.state.selectedFolderPath);
    const modifiedPath = this.normalizePath(modifiedDirectory);

    if (modifiedPath === '.') {
      return true;
    }

    return (
      currentPath === modifiedPath ||
      currentPath.startsWith(`${modifiedPath}/`) ||
      modifiedPath.startsWith(`${currentPath}/`)
    );
  }

  private async setSelectedFolder(folderPath: string): Promise<void> {
    const normalized = this.normalizePath(folderPath);
    this.state.selectedFolderPath = normalized;
    this.state.displayPath = this.toResourcePath(normalized);
    this.notify();
    await this.loadFolder(normalized);
  }

  private async loadFolder(folderPath: string): Promise<void> {
    const requestVersion = ++this.requestVersion;
    this.state.isLoading = true;
    this.state.errorMessage = null;
    this.notify();

    try {
      const entries = await this.projectService.listDirectory(folderPath === '.' ? '.' : folderPath);
      const filteredEntries = entries
        .filter(entry => !entry.name.startsWith('.') && entry.name !== 'node_modules')
        .sort((a, b) => {
          const kindOrder = Number(b.kind === 'directory') - Number(a.kind === 'directory');
          if (kindOrder !== 0) {
            return kindOrder;
          }
          return a.name.localeCompare(b.name);
        });

      const items: AssetPreviewItem[] = [];
      for (const entry of filteredEntries) {
        items.push(await this.buildPreviewItem(entry.name, entry.path, entry.kind));
      }

      if (requestVersion !== this.requestVersion) {
        for (const item of items) {
          if (item.thumbnailUrl) {
            URL.revokeObjectURL(item.thumbnailUrl);
          }
        }
        return;
      }

      this.clearObjectUrls();
      for (const item of items) {
        if (item.thumbnailUrl) {
          this.objectUrls.add(item.thumbnailUrl);
        }
      }

      this.state.items = items;
      this.state.errorMessage = null;
    } catch (error) {
      if (requestVersion !== this.requestVersion) {
        return;
      }

      this.clearObjectUrls();
      this.state.items = [];
      this.state.errorMessage =
        error instanceof Error ? error.message : 'Failed to load assets preview for folder.';
    } finally {
      if (requestVersion === this.requestVersion) {
        this.state.isLoading = false;
      }
      this.notify();
    }
  }

  private async buildPreviewItem(
    name: string,
    path: string,
    kind: FileSystemHandleKind
  ): Promise<AssetPreviewItem> {
    const extension = this.getExtension(name);
    if (kind === 'directory') {
      return {
        name,
        path,
        kind,
        extension,
        previewType: 'icon',
        thumbnailUrl: null,
        iconName: 'folder',
      };
    }

    if (IMAGE_EXTENSIONS.has(extension)) {
      try {
        const blob = await this.fileSystemService.readBlob(path);
        const thumbnailUrl = URL.createObjectURL(blob);
        return {
          name,
          path,
          kind,
          extension,
          previewType: 'image',
          thumbnailUrl,
          iconName: 'image',
        };
      } catch {
        // Fall back to icon preview when image read fails.
      }
    }

    return {
      name,
      path,
      kind,
      extension,
      previewType: 'icon',
      thumbnailUrl: null,
      iconName: this.resolveIconForExtension(extension),
    };
  }

  private getExtension(name: string): string {
    const lastDot = name.lastIndexOf('.');
    if (lastDot < 0 || lastDot === name.length - 1) {
      return '';
    }
    return name.slice(lastDot + 1).toLowerCase();
  }

  private resolveIconForExtension(extension: string): string {
    if (!extension) {
      return 'file';
    }

    if (['ts', 'js', 'json', 'css', 'html', 'md', 'txt', 'yml', 'yaml'].includes(extension)) {
      return 'file-text';
    }

    if (['glb', 'gltf', 'fbx', 'obj'].includes(extension)) {
      return 'box';
    }

    if (['wav', 'mp3', 'ogg'].includes(extension)) {
      return 'music';
    }

    if (['mp4', 'webm', 'mov'].includes(extension)) {
      return 'film';
    }

    return 'file';
  }

  private normalizePath(path: string): string {
    const normalized = path
      .replace(/\\+/g, '/')
      .replace(/^\.\//, '')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');
    return normalized.length > 0 ? normalized : '.';
  }

  private getParentPath(path: string): string {
    const normalized = this.normalizePath(path);
    if (normalized === '.') {
      return '.';
    }

    const parts = normalized.split('/');
    if (parts.length <= 1) {
      return '.';
    }
    return parts.slice(0, -1).join('/');
  }

  private toResourcePath(path: string): string {
    if (path === '.') {
      return 'res://';
    }
    return `res://${path}`;
  }

  private clearObjectUrls(): void {
    for (const url of this.objectUrls) {
      URL.revokeObjectURL(url);
    }
    this.objectUrls.clear();
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
