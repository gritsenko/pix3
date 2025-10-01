import { inject, injectable } from '@/fw/di';

import { FileSystemAPIError, FileSystemAPIService } from './FileSystemAPIService';
import { BaseTemplateService } from './BaseTemplateService';

const RES_SCHEME = 'res';
const TEMPLATE_SCHEME = 'templ';

export interface ReadResourceOptions {
  readonly allowNetworkFallback?: boolean;
}

@injectable()
export class ResourceManager {
  @inject(FileSystemAPIService)
  private readonly fileSystem!: FileSystemAPIService;

  @inject(BaseTemplateService)
  private readonly templateService!: BaseTemplateService;

  async readText(resource: string, options: ReadResourceOptions = {}): Promise<string> {
    const scheme = this.getScheme(resource);

    switch (scheme) {
      case TEMPLATE_SCHEME:
        return this.templateService.resolveSceneTemplateFromUri(resource);
      case RES_SCHEME:
        return await this.readProjectResource(resource, options.allowNetworkFallback !== false);
      case 'http':
      case 'https':
        return await this.fetchText(resource);
      case '':
        return await this.fetchText(resource);
      default:
        throw new Error(`Unsupported resource scheme: ${scheme || '(none)'}`);
    }
  }

  normalize(resource: string): string {
    const scheme = this.getScheme(resource);
    if (scheme === RES_SCHEME) {
      return this.fileSystem.normalizeResourcePath(resource);
    }
    if (scheme === TEMPLATE_SCHEME) {
      return resource.replace(/^templ:\/\//i, '');
    }
    return resource;
  }

  private async readProjectResource(
    resource: string,
    allowNetworkFallback: boolean
  ): Promise<string> {
    try {
      return await this.fileSystem.readTextFile(resource, { mode: 'read' });
    } catch (error) {
      if (error instanceof FileSystemAPIError) {
        if (!allowNetworkFallback) {
          throw error;
        }
        if (error.code !== 'not-initialized' && error.code !== 'not-found') {
          throw error;
        }
      } else if (!allowNetworkFallback) {
        throw error;
      }
    }

    const normalizedPath = this.fileSystem.normalizeResourcePath(resource);
    const requestUrl = this.buildPublicUrl(normalizedPath);
    return await this.fetchText(requestUrl);
  }

  private async fetchText(url: string): Promise<string> {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching ${url}`);
    }
    return await response.text();
  }

  private buildPublicUrl(relativePath: string): string {
    const envBase =
      (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    const base = envBase.replace(/\/*$/, '/');
    const trimmedPath = relativePath.replace(/^\/+/, '');
    return `${base}${trimmedPath}`;
  }

  private getScheme(resource: string): string {
    const match = /^([a-z]+[a-z0-9+.-]*):\/\//i.exec(resource.trim());
    if (!match) {
      return '';
    }
    return match[1].toLowerCase();
  }
}
