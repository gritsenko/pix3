import * as THREE from 'three';
import { ObjectPool, PoolConfig } from './ObjectPool';

export interface SpritePoolConfig extends PoolConfig {
  renderOrder?: number;
  materialConfig?: Partial<THREE.SpriteMaterialParameters>;
}

export class SpritePool extends ObjectPool<THREE.Sprite> {
  constructor(scene: THREE.Scene, config: SpritePoolConfig) {
    const factory = () => {
      const material = new THREE.SpriteMaterial({
        color: 0xffffff,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        fog: false,
        ...config.materialConfig,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = config.renderOrder ?? 100;
      return sprite;
    };

    super(factory, config, scene);
  }

  acquireWithTexture(texture: THREE.Texture): THREE.Sprite | null {
    const sprite = this.acquire();
    if (sprite) {
      const material = sprite.material as THREE.SpriteMaterial;
      material.map = texture;
      material.needsUpdate = true;
    }
    return sprite;
  }
}
