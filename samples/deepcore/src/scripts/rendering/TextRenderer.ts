import * as THREE from 'three';

/**
 * TextRenderer - Utility for creating canvas-based textures for damage numbers and HP bars
 * Uses Map-based caching with LRU eviction to minimize texture creation overhead
 */
export class TextRenderer {
  private textureCache: Map<string, THREE.CanvasTexture> = new Map();
  private maxCacheSize: number;

  constructor(maxCacheSize: number = 50) {
    this.maxCacheSize = maxCacheSize;
  }

  /**
   * Create or retrieve cached damage number texture
   */
  getDamageNumberTexture(damage: number, isCrit: boolean, config: any): THREE.CanvasTexture {
    const key = `dmg|${damage}|${isCrit}`;
    let texture = this.textureCache.get(key);

    if (!texture) {
      texture = this.createDamageNumberTexture(damage, isCrit, config);
      this.cacheTexture(key, texture);
    }

    return texture;
  }

  /**
   * Create damage number texture using canvas
   */
  private createDamageNumberTexture(
    damage: number,
    isCrit: boolean,
    config: any
  ): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    const size = config.textureSize;
    canvas.width = size.width;
    canvas.height = size.height;

    const ctx = canvas.getContext('2d')!;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Configure text styling
    const fontSize = isCrit ? config.critSize : config.normalSize;
    let color = isCrit ? config.critColor : config.normalColor;

    if (damage === 0) {
      color = "#aaaaaa"; // Grayscale for miss
    }

    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Add text shadow for readability and brightness
    // ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    // ctx.shadowBlur = 6;
    // ctx.shadowOffsetX = 2;
    // ctx.shadowOffsetY = 2;

    // Draw damage text
    const text = damage === 0 ? "MISS" : `-${damage}`;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    // Add a bright glow outline for extra visibility
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);

    // Create texture
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    return texture;
  }

  /**
   * Create HP bar texture (dynamic, updated per frame)
   */
  createHPBarTexture(
    hpPercentage: number,
    config: any
  ): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    const size = config.textureSize;
    canvas.width = size.width;
    canvas.height = size.height;

    const ctx = canvas.getContext('2d')!;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate dimensions with padding
    const padding = 2;
    const barWidth = canvas.width - padding * 2;
    const barHeight = canvas.height - padding * 2;
    const fillWidth = barWidth * hpPercentage;

    // Draw background (black with opacity)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(padding, padding, barWidth, barHeight);

    // Draw border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(padding, padding, barWidth, barHeight);

    // Determine fill color based on HP percentage
    let fillColor: string;
    if (hpPercentage > config.thresholdHigh) {
      fillColor = config.colorHigh;
    } else if (hpPercentage > config.thresholdMedium) {
      fillColor = config.colorMedium;
    } else {
      fillColor = config.colorLow;
    }

    // Draw HP fill
    if (fillWidth > 0) {
      ctx.fillStyle = fillColor;
      ctx.fillRect(padding, padding, fillWidth, barHeight);
      
      // Add bright highlight stripe for extra vibrancy
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fillRect(padding, padding, fillWidth, barHeight * 0.3);
    }

    // Create texture
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    return texture;
  }

  /**
   * Update existing HP bar texture with new percentage
   */
  updateHPBarTexture(
    texture: THREE.CanvasTexture,
    hpPercentage: number,
    config: any
  ): void {
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate dimensions with padding
    const padding = 2;
    const barWidth = canvas.width - padding * 2;
    const barHeight = canvas.height - padding * 2;
    const fillWidth = barWidth * hpPercentage;

    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(padding, padding, barWidth, barHeight);

    // Draw border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(padding, padding, barWidth, barHeight);

    // Determine fill color
    let fillColor: string;
    if (hpPercentage > config.thresholdHigh) {
      fillColor = config.colorHigh;
    } else if (hpPercentage > config.thresholdMedium) {
      fillColor = config.colorMedium;
    } else {
      fillColor = config.colorLow;
    }

    // Draw HP fill
    if (fillWidth > 0) {
      ctx.fillStyle = fillColor;
      ctx.fillRect(padding, padding, fillWidth, barHeight);
      
      // Add bright highlight stripe for extra vibrancy
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fillRect(padding, padding, fillWidth, barHeight * 0.3);
    }

    // Mark for GPU update
    texture.needsUpdate = true;
  }

  /**
   * Cache texture with LRU eviction
   */
  private cacheTexture(key: string, texture: THREE.CanvasTexture): void {
    // Evict oldest entry if cache is full
    if (this.textureCache.size >= this.maxCacheSize) {
      const firstKey = this.textureCache.keys().next().value;
      if (firstKey !== undefined) {
        const oldTexture = this.textureCache.get(firstKey);
        if (oldTexture) {
          oldTexture.dispose();
        }
        this.textureCache.delete(firstKey);
      }
    }

    this.textureCache.set(key, texture);
  }

  /**
   * Dispose all cached textures
   */
  dispose(): void {
    this.textureCache.forEach((texture) => {
      texture.dispose();
    });
    this.textureCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.textureCache.size,
      maxSize: this.maxCacheSize,
    };
  }
}
