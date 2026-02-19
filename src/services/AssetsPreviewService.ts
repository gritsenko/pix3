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
  readonly sizeBytes: number | null;
  readonly width: number | null;
  readonly height: number | null;
}

export interface AssetsPreviewSnapshot {
  readonly selectedFolderPath: string | null;
  readonly displayPath: string;
  readonly isLoading: boolean;
  readonly errorMessage: string | null;
  readonly selectedItemPath: string | null;
  readonly selectedItem: AssetPreviewItem | null;
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
    selectedItemPath: string | null;
    selectedItem: AssetPreviewItem | null;
    items: AssetPreviewItem[];
  } = {
    selectedFolderPath: null,
    displayPath: 'res://',
    isLoading: false,
    errorMessage: null,
    selectedItemPath: null,
    selectedItem: null,
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
      selectedItemPath: this.state.selectedItemPath,
      selectedItem: this.state.selectedItem,
      items: this.state.items,
    };
  }

  public selectItem(path: string): void {
    const normalizedPath = this.normalizePath(path);
    this.state.selectedItemPath = normalizedPath;
    this.state.selectedItem =
      this.state.items.find(item => this.normalizePath(item.path) === normalizedPath) ?? null;
    this.notify();
  }

  public clearSelectedItem(): void {
    if (!this.state.selectedItemPath && !this.state.selectedItem) {
      return;
    }
    this.state.selectedItemPath = null;
    this.state.selectedItem = null;
    this.notify();
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
      this.state.selectedItemPath = null;
      this.state.selectedItem = null;
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
      if (this.state.selectedItemPath) {
        this.state.selectedItem =
          items.find(item => this.normalizePath(item.path) === this.state.selectedItemPath) ?? null;
        if (!this.state.selectedItem) {
          this.state.selectedItemPath = null;
        }
      }
      this.state.errorMessage = null;
    } catch (error) {
      if (requestVersion !== this.requestVersion) {
        return;
      }

      this.clearObjectUrls();
      this.state.items = [];
      this.state.selectedItemPath = null;
      this.state.selectedItem = null;
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
        sizeBytes: null,
        width: null,
        height: null,
      };
    }

    let fileBlob: Blob | null = null;
    try {
      fileBlob = await this.fileSystemService.readBlob(path);
    } catch {
      fileBlob = null;
    }

    const sizeBytes = fileBlob?.size ?? null;

    if (IMAGE_EXTENSIONS.has(extension)) {
      if (fileBlob) {
        const thumbnailUrl = URL.createObjectURL(fileBlob);
        const dimensions = await this.getImageDimensions(fileBlob, thumbnailUrl);
        return {
          name,
          path,
          kind,
          extension,
          previewType: 'image',
          thumbnailUrl,
          iconName: 'image',
          sizeBytes,
          width: dimensions.width,
          height: dimensions.height,
        };
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
      sizeBytes,
      width: null,
      height: null,
    };
  }

  private async getImageDimensions(
    blob: Blob,
    objectUrl: string
  ): Promise<{ width: number | null; height: number | null }> {
    try {
      const bitmapFactory = (globalThis as { createImageBitmap?: (source: ImageBitmapSource) => Promise<ImageBitmap> }).createImageBitmap;
      if (bitmapFactory) {
        const bitmap = await bitmapFactory(blob);
        const dimensions = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return dimensions;
      }
    } catch {
      // fall back to HTMLImageElement
    }

    return new Promise(resolve => {
      const image = new Image();
      image.onload = () => {
        resolve({
          width: image.naturalWidth || null,
          height: image.naturalHeight || null,
        });
      };
      image.onerror = () => resolve({ width: null, height: null });
      image.src = objectUrl;
    });
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
