import { inject, injectable } from '@/fw/di';
import { ResourceManager as RuntimeResourceManager, type ReadResourceOptions } from '@pix3/runtime';
import { FileSystemAPIService } from './FileSystemAPIService';

const RES_SCHEME = 'res';

@injectable()
export class EditorResourceManager extends RuntimeResourceManager {
  @inject(FileSystemAPIService)
  private readonly fileSystem!: FileSystemAPIService;

  constructor() {
    super();
  }

  override async readText(resource: string): Promise<string> {
    const scheme = this.getScheme(resource);

    if (scheme === RES_SCHEME) {
      const path = resource.startsWith('res://') ? resource.substring(6) : resource;
      try {
        return await this.fileSystem.readTextFile(path);
      } catch (error) {
        // Fallback to network
        return super.readText(this.buildPublicUrl(resource));
      }
    }

    return super.readText(resource);
  }

  override async readBlob(resource: string): Promise<Blob> {
    const scheme = this.getScheme(resource);

    if (scheme === RES_SCHEME) {
      const path = resource.startsWith('res://') ? resource.substring(6) : resource;
      try {
        return await this.fileSystem.readBlob(path);
      } catch (error) {
        // Fallback to network
        return super.readBlob(this.buildPublicUrl(resource));
      }
    }

    return super.readBlob(resource);
  }

  override normalize(resource: string): string {
    const scheme = this.getScheme(resource);
    if (scheme === RES_SCHEME) {
      return this.fileSystem.normalizeResourcePath(resource);
    }
    return super.normalize(resource);
  }

  private buildPublicUrl(relativePath: string): string {
    const envBase = (import.meta as any).env?.BASE_URL ?? '/';
    const base = envBase.replace(/\/*$/, '/');
    const path = relativePath.startsWith('res://') ? relativePath.substring(6) : relativePath;
    const trimmedPath = path.replace(/^\/+/, '');
    return `${base}${trimmedPath}`;
  }
}

// Re-export as ResourceManager for the rest of the app
export { EditorResourceManager as ResourceManager, type ReadResourceOptions };
