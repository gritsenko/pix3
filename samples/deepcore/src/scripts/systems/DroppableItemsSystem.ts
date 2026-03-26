import * as THREE from 'three';
import { PhysicsWorld, type PhysicsBody } from '../physics/PhysicsWorld';
import { VoxelWorld } from '../world';
import { GameEvents, onGameEvent, emitGameEvent, type BlockDestroyedEvent, BlockType } from '../core/Types';
import { RENDERER } from '../config';
import { useGameStore } from '../core/GameStore';
import { ADRENALINE_CONFIG, DROPPABLE_EMBEDDING_RULES, DROPPABLE_ITEMS } from '../config/gameplay';
import { HapticSystem } from './HapticSystem';
import { assetDiagnostics } from '../utils/AssetDiagnostics';
import { atlasManager } from '../utils/AtlasManager';


export interface DroppableItem {
  sprite: THREE.Sprite;
  hitMesh: THREE.Object3D;
  debugHitMesh: THREE.Mesh | null;
  shadowMesh: THREE.Mesh | null;
  type: string;
  value: number;
  physicsBody: PhysicsBody | null;
  collected: boolean;
  collectAnimProgress: number;
}

export class DroppableItemsSystem {
  private scene: THREE.Scene;
  private physicsWorld: PhysicsWorld;
  private voxelWorld: VoxelWorld;
  private items: DroppableItem[] = [];
  private loadedTextures: Map<string, THREE.Texture> = new Map();

  private hitGeometry: THREE.BufferGeometry;
  private debugHitMaterial: THREE.MeshBasicMaterial;
  private shadowGeometry: THREE.SphereGeometry;

  private collectingItems: DroppableItem[] = [];

  private hoveredItem: DroppableItem | null = null;

  private readonly NORMAL_COLOR = 0xffffff;
  private readonly HOVER_COLOR = 0xffffff;

  private debugVisuals: boolean = false;

  constructor(scene: THREE.Scene, _camera: THREE.Camera, physicsWorld: PhysicsWorld, voxelWorld: VoxelWorld) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.voxelWorld = voxelWorld;

    this.hitGeometry = new THREE.BoxGeometry(0.48, 0.48, 0.48);
    this.debugHitMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, transparent: true, opacity: 0.3, depthWrite: false });

    this.shadowGeometry = new THREE.SphereGeometry(0.3, 12, 12);

    this.debugVisuals = useGameStore.getState().debugVisuals;

    this.preloadTextures();

    onGameEvent<BlockDestroyedEvent>(GameEvents.BLOCK_DESTROYED, (data) => {
      this.handleBlockDestruction(data);
    });
  }

  private preloadTextures(): void {
    for (const [key, cfg] of Object.entries(DROPPABLE_ITEMS)) {
      const itemConfig = cfg as any;
      const startTime = performance.now();
      assetDiagnostics.trackTextureStart(`item_${key}`, itemConfig.sprite);
      
      const tex = atlasManager.getSpriteTexture(itemConfig.sprite);
      if (tex) {
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        this.loadedTextures.set(key, tex);
        assetDiagnostics.trackTextureLoaded(`item_${key}`, itemConfig.sprite, tex, 0, performance.now() - startTime);
      } else {
        assetDiagnostics.trackTextureFailed(`item_${key}`, itemConfig.sprite);
      }
    }
  }

  private handleBlockDestruction(data: BlockDestroyedEvent): void {
    if (data.droppedQuantity <= 0) return;

    emitGameEvent(GameEvents.RESOURCES_DROPPED, {
      x: data.x,
      y: data.y,
      z: data.z,
      blockType: data.blockType,
      droppedQuantity: data.droppedQuantity,
    });

    // Spawn items from droppableItems map if available
    if (data.droppableItems && data.droppableItems.size > 0) {
      for (const [itemType, quantity] of data.droppableItems) {
        for (let i = 0; i < quantity; i++) {
          this.spawnItem(itemType, data.x, data.y, data.z);
        }
      }
    } else {
      // Fallback: spawn generic stone items
      for (let i = 0; i < data.droppedQuantity; i++) {
        this.spawnItem('stone', data.x, data.y, data.z);
      }
    }
  }

  spawnItem(type: string, worldX: number, worldY: number, worldZ: number): void {
    const config = DROPPABLE_ITEMS[type] || DROPPABLE_ITEMS.stone;

    const texture = this.loadedTextures.get(type);

    // Initialize with NORMAL_COLOR (dimmed)
    const material = new THREE.SpriteMaterial({
      map: texture || undefined,
      color: this.NORMAL_COLOR,
      transparent: true,
      alphaTest: 0.5,
      fog: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.set(worldX, worldY, worldZ);
    sprite.scale.setScalar(config.scale);
    this.scene.add(sprite);

    const debugHitMesh = this.debugVisuals ? this.createDebugHitMesh(sprite.position) : null;
    const shadowMesh = this.createShadowMesh(sprite.position, config.scale);

    // Use unified wrapper for droppable items in PhysicsWorld
    const physicsBody = (this.physicsWorld as any).createDroppableItem
      ? (this.physicsWorld as any).createDroppableItem(worldX, worldY, worldZ)
      : null;

    const item: DroppableItem = {
      sprite,
      hitMesh: sprite,
      debugHitMesh,
      shadowMesh,
      type,
      value: config.value,
      physicsBody,
      collected: false,
      collectAnimProgress: 0,
    };

    item.sprite.userData.droppableItemRef = item;
    if (item.debugHitMesh) {
      item.debugHitMesh.userData.droppableItemRef = item;
    }

    this.items.push(item);
  }

  private createDebugHitMesh(position: THREE.Vector3): THREE.Mesh {
    const hitMesh = new THREE.Mesh(this.hitGeometry, this.debugHitMaterial);
    hitMesh.position.copy(position);
    hitMesh.visible = this.debugVisuals;
    hitMesh.userData.isGizmo = true;
    this.scene.add(hitMesh);
    return hitMesh;
  }

  private createShadowMesh(position: THREE.Vector3, scale: number): THREE.Mesh | null {
    if (!RENDERER.droppableShadows) {
      return null;
    }

    const shadowMesh = new THREE.Mesh(
      this.shadowGeometry,
      new THREE.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
      })
    );

    shadowMesh.position.copy(position);
    shadowMesh.scale.setScalar(scale);
    shadowMesh.castShadow = true;
    shadowMesh.receiveShadow = false;
    shadowMesh.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    });
    this.scene.add(shadowMesh);

    return shadowMesh;
  }

  private ensureDebugHitMesh(item: DroppableItem): void {
    if (item.debugHitMesh) {
      item.debugHitMesh.visible = this.debugVisuals;
      return;
    }

    item.debugHitMesh = this.createDebugHitMesh(item.sprite.position);
    item.debugHitMesh.userData.droppableItemRef = item;
  }

  private findItemByTarget(target: THREE.Object3D): DroppableItem | null {
    return this.items.find((item) => item.hitMesh === target || item.debugHitMesh === target || item.sprite === target) || null;
  }

  private getItemWorldPosition(item: DroppableItem): THREE.Vector3 {
    if (item.physicsBody) {
      const pos = item.physicsBody.rigidBody.translation();
      return new THREE.Vector3(pos.x, pos.y, pos.z);
    }

    return item.sprite.position.clone();
  }

  public getTargetPositionForObject(target: THREE.Object3D): THREE.Vector3 | null {
    const itemRef = target.userData?.droppableItemRef as DroppableItem | undefined;
    if (itemRef && !itemRef.collected) {
      return this.getItemWorldPosition(itemRef);
    }

    const matched = this.items.find(i => i.hitMesh === target || i.sprite === target);
    if (!matched || matched.collected) {
      return null;
    }

    return this.getItemWorldPosition(matched);
  }

  // Raycast helpers expected by Game.ts
  getResourceTargets(): THREE.Object3D[] {
    return this.items.filter(i => !i.collected).map(i => i.hitMesh);
  }

  getHoveredResource(): DroppableItem | null {
    return this.hoveredItem;
  }

  setHoveredResourceTarget(hitMesh: THREE.Object3D | null): void {
    const item = hitMesh ? this.findItemByTarget(hitMesh) : null;
    this.setHoveredResource(item);
  }

  setHoveredResourceSprite(sprite: THREE.Sprite | null): void {
    const item = sprite ? this.items.find(i => i.sprite === sprite && !i.collected) || null : null;
    this.setHoveredResource(item);
  }

  private setHoveredResource(item: DroppableItem | null): void {
    if (this.hoveredItem && this.hoveredItem !== item) {
      this.setItemHover(this.hoveredItem, false);
    }
    if (item && this.hoveredItem !== item) {
      this.setItemHover(item, true);
    }
    this.hoveredItem = item;
  }

  private setItemHover(item: DroppableItem, isHovered: boolean): void {
    // Switch between NORMAL_COLOR (0xbbbbbb) and HOVER_COLOR (0xffffff)
    const targetColor = isHovered ? this.HOVER_COLOR : this.NORMAL_COLOR;
    (item.sprite.material as THREE.SpriteMaterial).color.setHex(targetColor);
  }

  clearHover(): void {
    this.setHoveredResource(null);
  }

  getActiveItems(): DroppableItem[] {
    return this.items.filter(i => !i.collected);
  }

  isItemCollected(hitMesh: THREE.Object3D): boolean {
    const item = this.findItemByTarget(hitMesh);
    return item ? item.collected : true;
  }

  checkProximityCollection(position: THREE.Vector3, radius: number): void {
    for (const item of this.items) {
      if (item.collected) continue;
      const worldPos = this.getItemWorldPosition(item);
      const dist = position.distanceTo(worldPos);
      if (dist < radius) {
        this.collectResource(item);
      }
    }
  }

  private removeItemImmediately(item: DroppableItem): void {
    if (this.hoveredItem === item) {
      this.setItemHover(item, false);
      this.hoveredItem = null;
    }

    this.scene.remove(item.sprite);
    if (item.debugHitMesh) {
      this.scene.remove(item.debugHitMesh);
    }
    if (item.shadowMesh) {
      this.scene.remove(item.shadowMesh);
    }

    item.sprite.material.dispose();
    if (item.shadowMesh) {
      if (Array.isArray(item.shadowMesh.material)) {
        item.shadowMesh.material.forEach(m => m.dispose());
      } else {
        item.shadowMesh.material.dispose();
      }
    }

    if (item.physicsBody) {
      this.physicsWorld.scheduleRemoval(item.physicsBody);
    }

    const itemIndex = this.items.indexOf(item);
    if (itemIndex !== -1) {
      this.items.splice(itemIndex, 1);
    }

    const collectingIndex = this.collectingItems.indexOf(item);
    if (collectingIndex !== -1) {
      this.collectingItems.splice(collectingIndex, 1);
    }
  }

  private resolveEmbeddedItem(item: DroppableItem): void {
    const worldPos = this.getItemWorldPosition(item);
    const gridX = Math.floor(worldPos.x) + 0.5;
    const gridY = Math.round(worldPos.y);
    const gridZ = Math.floor(worldPos.z) + 0.5;

    const block = this.voxelWorld.getBlock(gridX, gridY, gridZ);
    if (!block || block.type === BlockType.AIR || block.type === BlockType.BEDROCK) {
      return;
    }

    const rule = DROPPABLE_EMBEDDING_RULES[block.type] ?? { absorbChance: 0.5, destroyAdrenalineFactor: 2.5 };
    const shouldAbsorb = Math.random() < rule.absorbChance;

    if (shouldAbsorb) {
      const current = block.droppableItems.get(item.type) || 0;
      block.droppableItems.set(item.type, current + 1);
    } else {
      const adrenalineGain = Math.max(1, Math.round(item.value * rule.destroyAdrenalineFactor));
      useGameStore.getState().addAdrenaline(Math.min(adrenalineGain, ADRENALINE_CONFIG.maxValue));
    }

    this.removeItemImmediately(item);
  }

  collectResource(item: DroppableItem): void {
    if (item.collected) return;
    if (this.hoveredItem === item) {
      this.setItemHover(item, false);
      this.hoveredItem = null;
    }
    item.collected = true;
    item.collectAnimProgress = 0;
    this.collectingItems.push(item);

    const store = useGameStore.getState();
    store.addGold(item.value);

    // Trigger haptic feedback on resource collection
    HapticSystem.resourceCollection();

    (window as any).dispatchEvent(new CustomEvent(GameEvents.LOOT_COLLECTED, {
      detail: { itemType: item.type, value: item.value }
    }));
  }

  wakeDroppablesInColumn(x: number, y: number, z: number): void {
    const columnRadius = 1.2;

    for (const item of this.items) {
      if (item.collected || !item.physicsBody) continue;

      const pos = item.physicsBody.rigidBody.translation();

      // Check if item is in same column (within X,Z radius)
      const dx = Math.abs(pos.x - x);
      const dz = Math.abs(pos.z - z);

      if (dx < columnRadius && dz < columnRadius && pos.y > y) {
        // Item is in column and above the trigger point - wake it up
        item.physicsBody.rigidBody.wakeUp();
      }
    }
  }

  update(delta: number, _cameraPosition?: THREE.Vector3): void {
    // Sync debug visuals
    const currentDebugVisuals = useGameStore.getState().debugVisuals;
    if (this.debugVisuals !== currentDebugVisuals) {
      this.debugVisuals = currentDebugVisuals;
      for (const item of this.items) {
        if (this.debugVisuals) {
          this.ensureDebugHitMesh(item);
        } else if (item.debugHitMesh) {
          item.debugHitMesh.visible = false;
        }
      }
    }

    for (const item of this.items) {
      if (item.collected) continue;
      if (item.physicsBody) {
        const pos = item.physicsBody.rigidBody.translation();

        const distSq =
          (pos.x - item.sprite.position.x) ** 2 +
          (pos.y - item.sprite.position.y) ** 2 +
          (pos.z - item.sprite.position.z) ** 2;

        const lerpFactor = distSq > 1.0 ? 1.0 : 15.0 * delta;
        const alpha = Math.min(lerpFactor, 1.0);

        item.sprite.position.x += (pos.x - item.sprite.position.x) * alpha;
        item.sprite.position.y += (pos.y - item.sprite.position.y) * alpha;
        item.sprite.position.z += (pos.z - item.sprite.position.z) * alpha;

        if (item.debugHitMesh) {
          item.debugHitMesh.position.copy(item.sprite.position);
        }
        if (item.shadowMesh) {
          item.shadowMesh.position.copy(item.sprite.position);
        }
      }
    }

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (item.collected) continue;
      this.resolveEmbeddedItem(item);
    }

    for (let i = this.collectingItems.length - 1; i >= 0; i--) {
      const it = this.collectingItems[i];
      it.collectAnimProgress += delta * 3;
      if (it.collectAnimProgress >= 1) {
        this.scene.remove(it.sprite);
        if (it.debugHitMesh) {
          this.scene.remove(it.debugHitMesh);
        }
        if (it.shadowMesh) {
          this.scene.remove(it.shadowMesh);
        }
        it.sprite.material.dispose();
        if (it.shadowMesh) {
          if (Array.isArray(it.shadowMesh.material)) {
            it.shadowMesh.material.forEach(m => m.dispose());
          } else {
            it.shadowMesh.material.dispose();
          }
        }
        if (it.physicsBody) this.physicsWorld.scheduleRemoval(it.physicsBody);
        const idx = this.items.indexOf(it);
        if (idx !== -1) this.items.splice(idx, 1);
        this.collectingItems.splice(i, 1);
        continue;
      }
      const scale = (1 - it.collectAnimProgress) * (DROPPABLE_ITEMS[it.type]?.scale || 0.4);
      it.sprite.scale.setScalar(Math.max(0.1, scale));
      if (it.shadowMesh) {
        it.shadowMesh.scale.setScalar(Math.max(0.1, scale));
      }
      it.sprite.position.y += delta * 8;
      it.sprite.position.x += delta * 2;
      if (it.debugHitMesh) {
        it.debugHitMesh.position.copy(it.sprite.position);
      }
      if (it.shadowMesh) {
        it.shadowMesh.position.copy(it.sprite.position);
      }
      (it.sprite.material as THREE.SpriteMaterial).opacity = 1 - it.collectAnimProgress;
    }
  }

  applyFloatingOriginOffset(offset: number): void {
    for (const it of this.items) {
      it.sprite.position.y -= offset;
      if (it.debugHitMesh) {
        it.debugHitMesh.position.y -= offset;
      }
      if (it.shadowMesh) {
        it.shadowMesh.position.y -= offset;
      }
      if (it.physicsBody) {
        const pos = it.physicsBody.rigidBody.translation();
        it.physicsBody.rigidBody.setTranslation({ x: pos.x, y: pos.y - offset, z: pos.z }, true);
      }
    }
  }

  createDebugGizmos(): void {
    for (const item of this.items) {
      this.ensureDebugHitMesh(item);
      if (item.debugHitMesh) {
        item.debugHitMesh.visible = true;
      }
    }
  }

  removeDebugGizmos(): void {
    for (const item of this.items) {
      if (item.debugHitMesh) {
        item.debugHitMesh.visible = false;
      }
    }
  }

  updateDebugGizmos(): void {
  }

  dispose(): void {
    for (const it of this.items) {
      this.scene.remove(it.sprite);
      if (it.debugHitMesh) {
        this.scene.remove(it.debugHitMesh);
      }
      if (it.shadowMesh) {
        this.scene.remove(it.shadowMesh);
      }
      it.sprite.material.dispose();
      if (it.shadowMesh) {
        if (Array.isArray(it.shadowMesh.material)) {
          it.shadowMesh.material.forEach(m => m.dispose());
        } else {
          it.shadowMesh.material.dispose();
        }
      }
      if (it.physicsBody) this.physicsWorld.scheduleRemoval(it.physicsBody);
    }
    this.items = [];
    this.hitGeometry.dispose();
    this.debugHitMaterial.dispose();
    this.shadowGeometry.dispose();
    for (const [, t] of this.loadedTextures) t.dispose();
    this.loadedTextures.clear();
  }
}
