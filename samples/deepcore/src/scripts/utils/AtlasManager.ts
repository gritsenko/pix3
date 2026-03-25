import * as THREE from 'three';
import { assetDiagnostics } from './AssetDiagnostics';

interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
}

interface AtlasMetadata {
  frames: Record<string, AtlasFrame>;
  meta: {
    size: { w: number; h: number };
    image: string;
  };
}

export class AtlasManager {
  private static instance: AtlasManager;
  private atlasTexture: THREE.Texture | null = null;
  private metadata: AtlasMetadata | null = null;
  private promise: Promise<void> | null = null;
  private textureLoader = new THREE.TextureLoader();

  private constructor() {}

  public static getInstance(): AtlasManager {
    if (!AtlasManager.instance) {
      AtlasManager.instance = new AtlasManager();
    }
    return AtlasManager.instance;
  }

  /**
   * Loads the atlas and its metadata
   */
  public async loadAtlas(imageUrl: string, jsonUrl: string): Promise<void> {
    if (this.promise) return this.promise;

    this.promise = (async () => {
      const startTime = performance.now();
      assetDiagnostics.trackTextureStart('game_atlas', imageUrl);

      try {
        // Load JSON metadata
        const response = await fetch(jsonUrl);
        if (!response.ok) throw new Error(`Failed to load atlas metadata: ${response.statusText}`);
        this.metadata = await response.json();

        // Load Atlas Image
        this.atlasTexture = await new Promise((resolve, reject) => {
          this.textureLoader.load(
            imageUrl,
            (tex) => resolve(tex),
            undefined,
            (err) => reject(err)
          );
        });

        if (this.atlasTexture) {
          this.atlasTexture.colorSpace = THREE.SRGBColorSpace;
          // Set filters for pixel art if needed, otherwise linear is fine
          this.atlasTexture.magFilter = THREE.LinearFilter;
          this.atlasTexture.minFilter = THREE.LinearMipmapLinearFilter;
          
          assetDiagnostics.trackTextureLoaded(
            'game_atlas',
            imageUrl,
            this.atlasTexture,
            0,
            performance.now() - startTime
          );
        }
      } catch (error) {
        console.error('AtlasManager: Error loading atlas', error);
        assetDiagnostics.trackTextureFailed('game_atlas', imageUrl);
        throw error;
      }
    })();

    return this.promise;
  }

  /**
   * Returns a modified texture clone for a specific sprite in the atlas
   * @param path Relative path in the atlas (e.g., 'ui/item_axe.png')
   */
  public getSpriteTexture(path: string): THREE.Texture | null {
    if (!this.atlasTexture || !this.metadata) {
      console.warn(`AtlasManager: Atlas not loaded yet (requesting ${path})`);
      return null;
    }

    const frameInfo = this.metadata.frames[path];
    if (!frameInfo) {
      console.warn(`AtlasManager: Sprite not found in atlas: ${path}`);
      return null;
    }

    const { x, y, w, h } = frameInfo.frame;
    const { w: atlasW, h: atlasH } = this.metadata.meta.size;

    // Clone the texture to avoid affecting the main atlas or other sprites
    const texture = this.atlasTexture.clone();
    texture.name = `atlas_sprite_${path}`;

    // Calculate UV offset and repeat
    // THREE.js UV coordinates: (0,0) is bottom-left, (1,1) is top-right
    // texture.offset: (x, y)
    // texture.repeat: (w, h)
    
    // In atlas JSON, (0,0) is top-left
    texture.repeat.set(w / atlasW, h / atlasH);
    texture.offset.set(x / atlasW, 1 - (y + h) / atlasH);

    texture.needsUpdate = true;

    return texture;
  }

  public isLoaded(): boolean {
    return !!(this.atlasTexture && this.metadata);
  }
}

export const atlasManager = AtlasManager.getInstance();
