import * as THREE from 'three';
import { FEEDBACK } from '../config';
import { TextRenderer } from '../rendering/TextRenderer';
import { SpritePool } from '../utils/SpritePool';
import { gameplayConfig } from '../config/gameplay';

interface DamageNumber {
  sprite: THREE.Sprite;
  startTime: number;
  worldX: number;
  worldY: number;
  worldZ: number;
  velocityX: number;
  velocityY: number;
  isCrit: boolean;
  age: number;
}

interface HPBar {
  sprite: THREE.Sprite;
  texture: THREE.CanvasTexture;
  blockKey: string;
  worldX: number;
  worldY: number;
  worldZ: number;
  createdAt: number;
  lastRefreshTime: number;
  maxHp: number;
  currentHp: number;
  displayedHp: number;
}

interface Sparkle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

export class FeedbackSystem {
  private scene: THREE.Scene;

  // WebGL sprite pools
  private damageNumbers: DamageNumber[] = [];
  private damageNumberPool: SpritePool;
  private hpBars: Map<string, HPBar> = new Map();
  private hpBarPool: SpritePool;

  private sparkles: Sparkle[] = [];
  private hoveredBlockKey: string | null = null;
  private focusedHpBarKey: string | null = null;

  // Text rendering
  private textRenderer: TextRenderer;

  // Global visibility flag
  private isVisible: boolean = true;

  // Sparkle resources
  private sparkleGeometry: THREE.PlaneGeometry;
  private sparkleMaterial: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, _camera: THREE.Camera) {
    this.scene = scene;
    // Camera not stored - billboarded sprites face camera automatically

    // Initialize text renderer
    this.textRenderer = new TextRenderer(FEEDBACK.damageNumbers.maxCached);

    // Create sprite pools
    this.damageNumberPool = new SpritePool(scene, {
      initialSize: FEEDBACK.damageNumbers.poolInitialSize,
      expandAmount: FEEDBACK.damageNumbers.poolExpandAmount,
      maxPoolSize: 100,
      maxActive: FEEDBACK.damageNumbers.maxActive,
      renderOrder: FEEDBACK.damageNumbers.renderOrder,
    });

    this.hpBarPool = new SpritePool(scene, {
      initialSize: FEEDBACK.hpBars.poolInitialSize,
      expandAmount: FEEDBACK.hpBars.poolExpandAmount,
      maxPoolSize: 50,
      maxActive: FEEDBACK.hpBars.maxActive,
      renderOrder: FEEDBACK.hpBars.renderOrder,
    });

    // Create sparkle geometry
    this.sparkleGeometry = new THREE.PlaneGeometry(0.15, 0.15);
    this.sparkleMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffaa,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
  }

  // Show floating damage number
  showDamageNumber(worldX: number, worldY: number, worldZ: number, damage: number, isCrit: boolean = false): void {
    if (!FEEDBACK.enableDamageNumbers) {
      return;
    }

    const texture = this.textRenderer.getDamageNumberTexture(
      Math.round(damage),
      isCrit,
      FEEDBACK.damageNumbers
    );

    const sprite = this.damageNumberPool.acquireWithTexture(texture);
    if (!sprite) {
      console.warn('Damage number pool exhausted');
      return;
    }

    const material = sprite.material as THREE.SpriteMaterial;
    material.opacity = FEEDBACK.damageNumbers.initialOpacity;
    material.needsUpdate = true;
    sprite.visible = this.isVisible;

    // Position sprite in world space (starting height offset from block)
    const heightOffset = FEEDBACK.damageNumbers.heightOffset;
    sprite.position.set(worldX, worldY + heightOffset, worldZ);
    
    // Set sprite scale
    const scale = FEEDBACK.damageNumbers.spriteScale;
    sprite.scale.set(scale, scale * 0.5, 1); // Aspect ratio for text

    // Random trajectory velocity
    const velocityX = (Math.random() - 0.5) * FEEDBACK.damageNumbers.trajectorySpeed.x;
    const velocityY = FEEDBACK.damageNumbers.trajectorySpeed.y + Math.random() * 2;

    this.damageNumbers.push({
      sprite,
      startTime: Date.now(),
      worldX,
      worldY: worldY + heightOffset,
      worldZ,
      velocityX,
      velocityY,
      isCrit,
      age: 0,
    });
  }

  // Show HP bar above block (controlled via mouse events)
  showHPBar(worldX: number, worldY: number, worldZ: number, currentHp: number, maxHp: number): void {
    this.showHPBarAt(worldX, worldY, worldZ, currentHp, maxHp, worldX, worldY + FEEDBACK.hpBars.offsetY, worldZ);
  }

  showHPBarAt(
    blockX: number,
    blockY: number,
    blockZ: number,
    currentHp: number,
    maxHp: number,
    displayX: number,
    displayY: number,
    displayZ: number,
    previousHp?: number
  ): void {
    const blockKey = `${blockX},${blockY},${blockZ}`;

    // Update existing or create new
    let hpBar = this.hpBars.get(blockKey);

    if (!hpBar) {
      const displayedHp = previousHp !== undefined
        ? Math.max(0, Math.min(maxHp, previousHp))
        : Math.min(maxHp, currentHp + 1);
      const hpPercentage = Math.max(0, Math.min(1, displayedHp / maxHp));
      const texture = this.textRenderer.createHPBarTexture(hpPercentage, FEEDBACK.hpBars);

      const sprite = this.hpBarPool.acquireWithTexture(texture);
      if (!sprite) {
        console.warn('HP bar pool exhausted');
        return;
      }

      const material = sprite.material as THREE.SpriteMaterial;
      material.opacity = 0;
      material.needsUpdate = true;
      sprite.visible = this.isVisible;

      // Position sprite above block
      sprite.position.set(displayX, displayY, displayZ);
      
      // Set sprite scale (wider aspect ratio for bars)
      const scale = FEEDBACK.hpBars.spriteScale;
      sprite.scale.set(scale, scale * 0.25, 1);

      hpBar = {
        sprite,
        texture,
        blockKey,
        worldX: displayX,
        worldY: displayY,
        worldZ: displayZ,
        createdAt: Date.now(),
        lastRefreshTime: Date.now(),
        maxHp,
        currentHp,
        displayedHp,
      };

      this.hpBars.set(blockKey, hpBar);
    } else {
      // Update existing HP bar
      hpBar.currentHp = currentHp;
      hpBar.maxHp = maxHp;
      hpBar.lastRefreshTime = Date.now();
      hpBar.worldX = displayX;
      hpBar.worldY = displayY;
      hpBar.worldZ = displayZ;
      hpBar.sprite.position.set(displayX, displayY, displayZ);
    }
  }

  showFocusedHPBar(
    blockX: number,
    blockY: number,
    blockZ: number,
    currentHp: number,
    maxHp: number,
    displayX: number,
    displayY: number,
    displayZ: number,
    previousHp?: number
  ): void {
    const key = `${blockX},${blockY},${blockZ}`;
    this.focusedHpBarKey = key;

    for (const existingKey of Array.from(this.hpBars.keys())) {
      if (existingKey !== key) {
        const existing = this.hpBars.get(existingKey);
        if (existing) {
          existing.texture.dispose();
          this.hpBarPool.release(existing.sprite);
        }
        this.hpBars.delete(existingKey);
      }
    }

    this.showHPBarAt(blockX, blockY, blockZ, currentHp, maxHp, displayX, displayY, displayZ, previousHp);
  }

  clearFocusedHPBar(): void {
    this.focusedHpBarKey = null;

    for (const [key, hpBar] of this.hpBars) {
      hpBar.texture.dispose();
      this.hpBarPool.release(hpBar.sprite);
      this.hpBars.delete(key);
    }
  }

  releaseFocusedHPBar(): void {
    this.focusedHpBarKey = null;
  }

  // Set currently hovered block to show dimmed HP bar
  setHoveredBlock(x: number | null, y: number | null, z: number | null, currentHp?: number, maxHp?: number, isInteractable?: boolean): void {
    if (x === null || y === null || z === null) {
      this.hoveredBlockKey = null;
      return;
    }

    // Skip if HP bars are disabled
    if (!gameplayConfig.feedback.enableHPBars) {
      return;
    }

    const key = `${x},${y},${z}`;
    this.hoveredBlockKey = key;

    const bar = this.hpBars.get(key);
    if (bar) {
      // Adjust opacity for non-interactable blocks
      const material = bar.sprite.material as THREE.SpriteMaterial;
      if (!isInteractable) {
        material.opacity *= 0.7;
      }
    }

    // If HP is provided and no bar exists, create a "stale" bar that starts dimmed
    if (currentHp !== undefined && maxHp !== undefined) {
      if (!this.hpBars.has(key)) {
        this.showHPBar(x, y, z, currentHp, maxHp);
        const bar = this.hpBars.get(key);
        if (bar) {
          // Set startTime to the past so it immediately enters "dimmed" state
          bar.createdAt = Date.now() - (FEEDBACK.hpBars.fadeInDuration + 1) * 1000;
          bar.lastRefreshTime = Date.now() - (FEEDBACK.hpBars.showDuration + 1) * 1000;
          const material = bar.sprite.material as THREE.SpriteMaterial;
          if (!isInteractable) {
            material.opacity *= 0.7;
          }
        }
      }
    }
  }

  // Remove HP bar for destroyed block
  removeHPBar(worldX: number, worldY: number, worldZ: number): void {
    const blockKey = `${worldX},${worldY},${worldZ}`;
    const hpBar = this.hpBars.get(blockKey);
    if (hpBar) {
      hpBar.texture.dispose();
      this.hpBarPool.release(hpBar.sprite);
      this.hpBars.delete(blockKey);
    }
  }

  // Spawn sparkles for solid block hit
  spawnSparkles(worldX: number, worldY: number, worldZ: number, color: number = 0xffffaa): void {
    const sparkleCount = FEEDBACK.sparkles.count + Math.floor(Math.random() * 4);

    for (let i = 0; i < sparkleCount; i++) {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(this.sparkleGeometry.clone(), material);
      mesh.visible = this.isVisible;
      mesh.position.set(
        worldX + (Math.random() - 0.5) * 0.3,
        worldY + (Math.random() - 0.5) * 0.3,
        worldZ + (Math.random() - 0.5) * 0.3
      );

      // Random rotation
      mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      this.scene.add(mesh);

      // Random velocity outward
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * FEEDBACK.sparkles.velocityRange,
        Math.random() * (FEEDBACK.sparkles.velocityYMax - FEEDBACK.sparkles.velocityYMin) + FEEDBACK.sparkles.velocityYMin,
        (Math.random() - 0.5) * FEEDBACK.sparkles.velocityRange
      );

      this.sparkles.push({
        mesh,
        velocity,
        life: FEEDBACK.sparkles.life + Math.random() * FEEDBACK.sparkles.lifeVariation,
      });
    }
  }

  // Update camera reference (kept for API compatibility)
  updateCamera(_camera: THREE.Camera): void {
    // Billboarded sprites face camera automatically, no update needed
  }

  setVisible(visible: boolean): void {
      this.isVisible = visible;
      
      for (const dn of this.damageNumbers) {
          dn.sprite.visible = visible;
      }
      
      for (const hp of this.hpBars.values()) {
          hp.sprite.visible = visible;
      }
      
      for (const s of this.sparkles) {
          s.mesh.visible = visible;
      }
  }

  // Update all feedback effects
  update(delta: number): void {
    const now = Date.now();

    // Update damage numbers with ballistic trajectory and scale-pop
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dmg = this.damageNumbers[i];
      dmg.age += delta;

      if (dmg.age > FEEDBACK.damageNumbers.duration) {
        this.damageNumberPool.release(dmg.sprite);
        this.damageNumbers.splice(i, 1);
        continue;
      }

      // Ballistic trajectory with gravity
      dmg.velocityY += FEEDBACK.damageNumbers.trajectoryGravity * delta;
      dmg.worldX += dmg.velocityX * delta;
      dmg.worldY += dmg.velocityY * delta;

      // Update sprite position
      dmg.sprite.position.set(dmg.worldX, dmg.worldY, dmg.worldZ);

      // Scale-pop animation (scale up to peak, then back down)
      const t = dmg.age / FEEDBACK.damageNumbers.duration;
      let scale: number;
      const popDuration = FEEDBACK.damageNumbers.scalePopDuration;
      const popMax = FEEDBACK.damageNumbers.scalePopMax;
      
      if (dmg.age < popDuration) {
        // Scale up phase
        const popT = dmg.age / popDuration;
        scale = 1 + (popMax - 1) * popT;
      } else {
        // Scale down phase
        const remainingT = (dmg.age - popDuration) / (FEEDBACK.damageNumbers.duration - popDuration);
        scale = popMax - (popMax - 1) * remainingT;
      }

      const baseScale = FEEDBACK.damageNumbers.spriteScale * scale;
      dmg.sprite.scale.set(baseScale, baseScale * 0.5, 1);

      // Fade out
      const opacity = 1 - t;
      const material = dmg.sprite.material as THREE.SpriteMaterial;
      material.opacity = Math.max(0, opacity);
    }

    // Update HP bars
    for (const [key, hpBar] of this.hpBars) {
      const visibleAge = (now - hpBar.createdAt) / 1000;
      const sinceRefresh = (now - hpBar.lastRefreshTime) / 1000;
      const isHovered = key === this.hoveredBlockKey;
      const isFocused = key === this.focusedHpBarKey;
      const material = hpBar.sprite.material as THREE.SpriteMaterial;
      const fadeInDuration = FEEDBACK.hpBars.fadeInDuration;
      const fadeOutDuration = FEEDBACK.hpBars.fadeOutDuration;
      const initialOpacity = FEEDBACK.hpBars.initialOpacity;
      const hpDelta = hpBar.currentHp - hpBar.displayedHp;

      if (Math.abs(hpDelta) > 0.001) {
        const step = Math.min(1, delta * FEEDBACK.hpBars.fillLerpSpeed);
        hpBar.displayedHp += hpDelta * step;
        if (Math.abs(hpBar.currentHp - hpBar.displayedHp) < 0.01) {
          hpBar.displayedHp = hpBar.currentHp;
        }

        const hpPercentage = Math.max(0, Math.min(1, hpBar.displayedHp / hpBar.maxHp));
        this.textRenderer.updateHPBarTexture(hpBar.texture, hpPercentage, FEEDBACK.hpBars);
      }

      if (visibleAge < fadeInDuration) {
        material.opacity = initialOpacity * (visibleAge / fadeInDuration);
        continue;
      }

      // Hide after configured duration
      if (sinceRefresh > FEEDBACK.hpBars.showDuration) {
        if (isFocused) {
          material.opacity = initialOpacity;
        } else if (isHovered) {
          material.opacity = 0.3;
        } else {
          const fadeOutAge = sinceRefresh - FEEDBACK.hpBars.showDuration;
          const fadeOutT = Math.min(1, fadeOutAge / fadeOutDuration);
          material.opacity = initialOpacity * (1 - fadeOutT);
        }

        if (!isHovered && !isFocused && sinceRefresh > FEEDBACK.hpBars.showDuration + FEEDBACK.hpBars.hideDuration) {
          hpBar.texture.dispose();
          this.hpBarPool.release(hpBar.sprite);
          this.hpBars.delete(key);
          continue;
        }
      } else {
        material.opacity = initialOpacity;
      }

      // HP bars stay at fixed world position (no need to update position)
    }

    // Update sparkles
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const sparkle = this.sparkles[i];
      sparkle.life -= delta;

      if (sparkle.life <= 0) {
        this.scene.remove(sparkle.mesh);
        sparkle.mesh.geometry.dispose();
        (sparkle.mesh.material as THREE.Material).dispose();
        this.sparkles.splice(i, 1);
        continue;
      }

      // Apply gravity
      sparkle.velocity.y += FEEDBACK.sparkles.gravity * delta;

      // Update position
      sparkle.mesh.position.add(sparkle.velocity.clone().multiplyScalar(delta));

      // Rotate
      sparkle.mesh.rotation.x += delta * FEEDBACK.sparkles.rotationSpeedX;
      sparkle.mesh.rotation.z += delta * FEEDBACK.sparkles.rotationSpeedZ;

      // Fade and shrink
      const scale = sparkle.life * (FEEDBACK.sparkles.scaleMax / FEEDBACK.sparkles.life);
      sparkle.mesh.scale.setScalar(Math.max(FEEDBACK.sparkles.scaleMin, scale));
      (sparkle.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, sparkle.life * 3);
    }
  }

  // Dispose
  dispose(): void {
    // Clean up active damage numbers
    for (const dmg of this.damageNumbers) {
      this.damageNumberPool.release(dmg.sprite);
    }
    this.damageNumbers = [];

    // Clean up HP bars
    for (const [, hpBar] of this.hpBars) {
      hpBar.texture.dispose();
      this.hpBarPool.release(hpBar.sprite);
    }
    this.hpBars.clear();

    // Dispose pools
    this.damageNumberPool.dispose();
    this.hpBarPool.dispose();

    // Clean up sparkles
    for (const sparkle of this.sparkles) {
      this.scene.remove(sparkle.mesh);
      sparkle.mesh.geometry.dispose();
      (sparkle.mesh.material as THREE.Material).dispose();
    }
    this.sparkles = [];

    // Dispose text renderer and cached textures
    this.textRenderer.dispose();

    this.sparkleGeometry.dispose();
    this.sparkleMaterial.dispose();
  }
}
