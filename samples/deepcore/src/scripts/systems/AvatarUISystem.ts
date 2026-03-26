import * as THREE from 'three';
import { type ISystem } from '../core/ISystem';
import { TEXTURES } from '../../assets/textures';
import { atlasManager } from '../utils/AtlasManager';

export class AvatarUISystem implements ISystem {
  private uiScene: THREE.Scene;
  private uiCamera: THREE.OrthographicCamera;
  private avatarSprite!: THREE.Sprite;

  // Avatar dimensions
  private avatarSize: number = 80; // 1.5x smaller than original ~120px

  constructor(uiScene: THREE.Scene, uiCamera: THREE.OrthographicCamera) {
    this.uiScene = uiScene;
    this.uiCamera = uiCamera;

    this.createAvatar();
  }

  public setVisible(visible: boolean): void {
      if (this.avatarSprite) {
          this.avatarSprite.visible = visible;
      }
  }

  private createAvatar(): void {
    const avatarTexture = atlasManager.getSpriteTexture(TEXTURES.avatar);
    if (avatarTexture) {
      avatarTexture.colorSpace = THREE.SRGBColorSpace;
    }

    const material = new THREE.SpriteMaterial({
      map: avatarTexture || new THREE.Texture(),
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
      sizeAttenuation: false,
    });

    this.avatarSprite = new THREE.Sprite(material);
    this.avatarSprite.scale.set(this.avatarSize, this.avatarSize, 1);
    this.avatarSprite.renderOrder = 102;
    this.uiScene.add(this.avatarSprite);

    this.updatePosition();
    window.addEventListener('resize', () => this.updatePosition());
  }

  private updatePosition(): void {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // Update camera to match window dimensions
    this.uiCamera.left = -windowWidth / 2;
    this.uiCamera.right = windowWidth / 2;
    this.uiCamera.top = windowHeight / 2;
    this.uiCamera.bottom = -windowHeight / 2;
    this.uiCamera.updateProjectionMatrix();

    // Position avatar at top center
    const avatarY = windowHeight / 2 - this.avatarSize / 2 - 20;
    this.avatarSprite.position.set(0, avatarY, 1);
  }

  playAttackAnimation(): void {
    // Scale animation on attack
    this.avatarSprite.scale.set(
      this.avatarSize * 1.15,
      this.avatarSize * 1.15,
      1
    );

    setTimeout(() => {
      this.avatarSprite.scale.set(this.avatarSize, this.avatarSize, 1);
    }, 100);
  }

  update(): void {
    // Avatar UI is static, no dynamic updates needed
  }

  dispose(): void {
    const material = this.avatarSprite.material as THREE.SpriteMaterial;
    if (material.map) {
      material.map.dispose();
    }
    material.dispose();
    this.uiScene.remove(this.avatarSprite);
    window.removeEventListener('resize', () => this.updatePosition());
  }
}
