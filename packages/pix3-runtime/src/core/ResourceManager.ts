/**
 * Runtime Resource Manager
 *
 * Handles loading of assets and resources for the runtime.
 * Supports loading from:
 * - res:// (mapped to base public URL)
 * - file:// (not really supported in web, but mapped to URL)
 * - http:// / https://
 * - blob: / data:
 */

export interface ReadResourceOptions {
  readonly allowNetworkFallback?: boolean;
}

export class ResourceManager {
  private baseUrl: string;

  constructor(baseUrl: string = '/') {
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  }

  /**
   * Normalize a resource path to a full URL.
   */
  normalize(resource: string): string {
    const scheme = this.getScheme(resource);
    
    if (scheme === 'res') {
        const path = resource.substring(6); // remove res://
        return this.buildUrl(path);
    }
    
    if (scheme === 'http' || scheme === 'https' || scheme === 'blob' || scheme === 'data') {
        return resource;
    }
    
    // Default to relative path from base
    return this.buildUrl(resource);
  }

  async readText(resource: string): Promise<string> {
    const url = this.normalize(resource);
    return await this.fetchText(url);
  }

  async readBlob(resource: string): Promise<Blob> {
    const url = this.normalize(resource);
    return await this.fetchBlob(url);
  }

  protected async fetchText(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching ${url}`);
    }
    return await response.text();
  }

  protected async fetchBlob(url: string): Promise<Blob> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching blob from ${url}`);
    }
    return await response.blob();
  }

  protected getScheme(resource: string): string {
    const match = /^([a-z]+[a-z0-9+.-]*):\/\//i.exec(resource.trim());
    if (!match) {
      return '';
    }
    return match[1].toLowerCase();
  }

  protected buildUrl(relativePath: string): string {
    const trimmedPath = relativePath.replace(/^\/+/, '');
    return `${this.baseUrl}${trimmedPath}`;
  }
}
