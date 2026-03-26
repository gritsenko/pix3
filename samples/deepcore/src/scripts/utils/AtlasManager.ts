import * as THREE from 'three';
import { ResourceManager } from '@pix3/runtime';
import { assetDiagnostics } from './AssetDiagnostics';

/**
 * DeepCore originally loaded a packed atlas + JSON metadata bundle.
 * In Pix3 play mode we now load the actual sprite assets through the shared
 * ResourceManager and keep a texture cache keyed by the asset URL.
 */
export class AtlasManager {
  private static instance: AtlasManager;
  private resourceManager: ResourceManager | null = null;
  private readonly atlasTextureCache: Map<string, THREE.Texture> = new Map();
  private readonly textureLoadInFlight: Map<string, Promise<THREE.Texture>> = new Map();
  private readonly textureLoader: THREE.TextureLoader = new THREE.TextureLoader();

  private constructor() {}

  public static getInstance(): AtlasManager {
    if (!AtlasManager.instance) {
      AtlasManager.instance = new AtlasManager();
    }
    return AtlasManager.instance;
  }

  public setResourceManager(resourceManager: ResourceManager): void {
    this.resourceManager = resourceManager;
  }

  /**
   * Preloads a set of sprite textures so UI systems can synchronously request
   * them during construction.
   */
  public async loadAtlas(spriteUrls: Iterable<string>): Promise<void> {
    const loads: Promise<THREE.Texture>[] = [];
    for (const spriteUrl of spriteUrls) {
      loads.push(this.loadSpriteTexture(spriteUrl));
    }

    await Promise.all(loads);
  }

  public async loadSpriteTexture(resourcePath: string): Promise<THREE.Texture> {
    const cachedTexture = this.atlasTextureCache.get(resourcePath);
    if (cachedTexture) {
      return cachedTexture;
    }

    const inflight = this.textureLoadInFlight.get(resourcePath);
    if (inflight) {
      return inflight;
    }

    const loadPromise = this.fetchSpriteTexture(resourcePath);
    this.textureLoadInFlight.set(resourcePath, loadPromise);
    loadPromise.finally(() => {
      this.textureLoadInFlight.delete(resourcePath);
    });

    return loadPromise;
  }

  /**
   * Returns a texture for the given sprite asset URL if it is already loaded.
   * Call {@link loadAtlas} first to preload sprites used during UI construction.
   */
  public getSpriteTexture(path: string): THREE.Texture | null {
    const texture = this.atlasTextureCache.get(path);
    if (!texture) {
      console.warn(`AtlasManager: Sprite not loaded yet (requesting ${path})`);
      void this.loadSpriteTexture(path).catch(error => {
        console.error(`AtlasManager: Failed to lazy-load sprite ${path}`, error);
      });
      return null;
    }

    return texture;
  }

  public isLoaded(): boolean {
    return this.atlasTextureCache.size > 0;
  }

  public dispose(): void {
    for (const texture of this.atlasTextureCache.values()) {
      texture.dispose();
    }
    this.atlasTextureCache.clear();
    this.textureLoadInFlight.clear();
  }

  private async fetchSpriteTexture(resourcePath: string): Promise<THREE.Texture> {
    const startTime = performance.now();
    assetDiagnostics.trackTextureStart(`sprite:${resourcePath}`, resourcePath);

    try {
      const blob = await this.readBlob(resourcePath);
      const objectUrl = URL.createObjectURL(blob);

      try {
        const texture = await new Promise<THREE.Texture>((resolve, reject) => {
          this.textureLoader.load(
            objectUrl,
            (loadedTexture) => resolve(loadedTexture),
            undefined,
            (error: unknown) => reject(error)
          );
        });

        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearFilter;
        texture.needsUpdate = true;

        this.atlasTextureCache.set(resourcePath, texture);
        assetDiagnostics.trackTextureLoaded(
          `sprite:${resourcePath}`,
          resourcePath,
          texture,
          blob.size,
          performance.now() - startTime
        );

        return texture;
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch (error) {
      assetDiagnostics.trackTextureFailed(`sprite:${resourcePath}`, resourcePath);
      console.error(`AtlasManager: Failed to load sprite texture ${resourcePath}`, error);
      throw error;
    }
  }

  private async readBlob(resourcePath: string): Promise<Blob> {
    if (this.resourceManager) {
      return this.resourceManager.readBlob(resourcePath);
    }

    const response = await fetch(resourcePath);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching ${resourcePath}`);
    }
    return await response.blob();
  }
}

export const atlasManager = AtlasManager.getInstance();
