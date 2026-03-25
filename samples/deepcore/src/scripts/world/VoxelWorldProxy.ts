import * as THREE from 'three';
import {
  BlockType,
  STABILITY_CONFIG,
  DEPTH_RANGE,
  UNSTABLE_BLOCKS,
  emitGameEvent,
  GameEvents,
  BlockDamagedEvent,
  BlockDestroyedEvent,
  DamageSource,
} from '../core/Types';
import { VoxelDataStore } from './VoxelDataStore';
import { VoxelData, DamageResult, ClusterBlockData } from './types';

/**
 * Facade for game systems to interact with voxel world
 * Hides internal data structure, emits events, enforces game rules
 * Systems should use this instead of VoxelDataStore directly
 */
export class VoxelWorldProxy {
  constructor(private store: VoxelDataStore) { }

  // === Queries (read-only) ===

  getVoxel(x: number, y: number, z: number): VoxelData | undefined {
    return this.store.get(x, y, z);
  }

  getVoxelIncludingDying(x: number, y: number, z: number): VoxelData | undefined {
    return this.store.getIncludingDying(x, y, z);
  }

  getNeighbors(x: number, y: number, z: number): VoxelData[] {
    return this.store.getNeighbors(x, y, z);
  }

  /**
   * Check if a voxel can be interacted with (mined)
   * - Must exist and not be AIR/BEDROCK
   * - Must have at least one exposed face
   * - Must be within depth range
   */
  isInteractable(x: number, y: number, z: number): boolean {
    const voxel = this.store.get(x, y, z);
    if (!voxel) return false;
    if (voxel.type === BlockType.AIR || voxel.type === BlockType.BEDROCK) return false;
    if (y < this.store.highestY - DEPTH_RANGE.maxDepthRange) return false;
    return this.store.isExposed(x, y, z);
  }

  /**
   * Check if a voxel is locked (surrounded, no exposed faces)
   */
  isLocked(x: number, y: number, z: number): boolean {
    const voxel = this.store.get(x, y, z);
    if (!voxel) return true;
    if (voxel.type === BlockType.AIR || voxel.type === BlockType.BEDROCK) return true;
    if (y < this.store.highestY - DEPTH_RANGE.maxDepthRange) return true;
    return !this.store.isExposed(x, y, z);
  }

  getAllVoxels(): VoxelData[] {
    return this.store.getAllVoxels();
  }

  getAllVoxelsIncludingDying(): VoxelData[] {
    return this.store.getAllVoxelsIncludingDying();
  }

  getVoxelsInYRange(minY: number, maxY: number, includeDying: boolean = false): VoxelData[] {
    return this.store.getVoxelsInYRange(minY, maxY, includeDying);
  }

  getConnectedCluster(voxel: VoxelData): { blocks: VoxelData[]; isAnchored: boolean } {
    return this.store.getConnectedCluster(voxel);
  }

  getUnstableProgress(x: number, y: number, z: number): { hitCount: number; heat: number } | null {
    const voxel = this.store.get(x, y, z);
    if (!voxel || voxel.type !== BlockType.UNSTABLE) {
      return null;
    }

    return {
      hitCount: voxel.unstableHitCount,
      heat: voxel.unstableHeat,
    };
  }

  registerUnstableToolHit(x: number, y: number, z: number, _hitPoint?: THREE.Vector3): { hitCount: number; heat: number } | null {
    const voxel = this.store.get(x, y, z);
    if (!voxel || voxel.type !== BlockType.UNSTABLE || voxel.isDying) {
      return null;
    }

    voxel.unstableHitCount += 1;
    voxel.unstableHeat = Math.min(1, voxel.unstableHitCount / Math.max(1, UNSTABLE_BLOCKS.hitsToExplode));
    this.store.markChunkDirty(this.store.getChunkId(y));

    return {
      hitCount: voxel.unstableHitCount,
      heat: voxel.unstableHeat,
    };
  }

  // === Mutations ===

  /**
   * Apply damage to a voxel, handling resource drops and destruction
   */
  damage(
    x: number,
    y: number,
    z: number,
    amount: number,
    hitPoint?: THREE.Vector3,
    source: DamageSource = 'system'
  ): DamageResult {
    const voxel = this.store.get(x, y, z);
    if (!voxel || voxel.type === BlockType.BEDROCK || voxel.isDying) {
      return { destroyed: false, remaining: Infinity, droppedQuantity: 0 };
    }

    const previousHp = voxel.hp;
    const oldDamageStage = voxel.damageStage;
    voxel.hp -= amount;
    this.store.refreshDamageStage(voxel);

    // Mark chunk dirty if damage stage changed (for damage indicator updates)
    if (voxel.damageStage !== oldDamageStage) {
      this.store.markChunkDirty(this.store.getChunkId(y));
    }

    if (voxel.hp <= 0) {
      // Block destroyed - count total droppable items
      let totalDropped = 0;
      for (const quantity of voxel.droppableItems.values()) {
        totalDropped += quantity;
      }

      voxel.isDying = true;
      this.store.recalculateNeighbors(x, y, z);

      // Mark chunk dirty for rendering update
      this.store.markChunkDirty(this.store.getChunkId(y));

      // Emit damaged event first to show damage numbers
      emitGameEvent<BlockDamagedEvent>(GameEvents.BLOCK_DAMAGED, {
        x, y, z,
        damage: amount,
        previousHp,
        remainingHp: 0,
        blockType: voxel.type,
        source,
        hitPoint,
      });

      // Emit destroyed event with droppable items
      emitGameEvent<BlockDestroyedEvent>(GameEvents.BLOCK_DESTROYED, {
        x, y, z,
        blockType: voxel.type,
        droppedQuantity: totalDropped,
        droppableItems: new Map(voxel.droppableItems),
        source,
        hitPoint,
      });

      return { destroyed: true, remaining: 0, droppedQuantity: totalDropped, destroyedVoxelType: voxel.type };
    }

    // Emit damaged event
    emitGameEvent<BlockDamagedEvent>(GameEvents.BLOCK_DAMAGED, {
      x, y, z,
      damage: amount,
      previousHp,
      remainingHp: voxel.hp,
      blockType: voxel.type,
      source,
      hitPoint,
    });

    return { destroyed: false, remaining: voxel.hp, droppedQuantity: 0 };
  }

  /**
   * Finalize removal after death animation completes
   */
  finalizeRemoval(x: number, y: number, z: number): void {
    this.store.remove(x, y, z);
    this.store.recalculateNeighbors(x, y, z);
    this.store.recalculateClusters();
    this.store.pruneEmptyTopLayers();
  }

  /**
   * Immediately remove a voxel (no animation)
   */
  removeImmediate(x: number, y: number, z: number): VoxelData | undefined {
    const voxel = this.store.remove(x, y, z);
    if (voxel) {
      this.store.recalculateNeighbors(x, y, z);
      this.store.recalculateClusters();
      this.store.pruneEmptyTopLayers();
    }
    return voxel;
  }

  /**
   * Place a voxel with existing data (for cluster landing)
   */
  placeFromData(
    data: Partial<VoxelData> & { x: number; y: number; z: number; type: BlockType }
  ): VoxelData {
    const voxel = this.store.setFromData(data);
    this.store.recalculateNeighbors(data.x, data.y, data.z);

    emitGameEvent(GameEvents.BLOCK_PLACED, {
      x: data.x,
      y: data.y,
      z: data.z,
      blockType: data.type,
    });

    return voxel;
  }


  /**
   * Extract blocks for a falling cluster
   * Removes blocks from world and returns cluster data
   */
  extractClusterBlocks(blocks: VoxelData[]): ClusterBlockData[] {
    const clusterBlocks: ClusterBlockData[] = [];

    for (const block of blocks) {
      clusterBlocks.push({
        type: block.type,
        hp: block.hp,
        initialHp: block.initialHp,
        droppableItems: new Map(block.droppableItems),
        gridX: block.x,
        gridY: block.y,
        gridZ: block.z,
        localX: 0,
        localY: 0,
        localZ: 0,
        // Preserve original rotation indices so we can restore orientation on landing
        rotXIndex: block.rotXIndex,
        rotYIndex: block.rotYIndex,
        rotZIndex: block.rotZIndex,
        soilBreakthroughUsed: false,
        unstableHitCount: block.unstableHitCount,
        unstableHeat: block.unstableHeat,
      });

      // Remove from store (don't emit events, cluster system handles it)
      this.store.remove(block.x, block.y, block.z);

      emitGameEvent(GameEvents.BLOCK_FALLING, {
        x: block.x,
        y: block.y,
        z: block.z,
        blockType: block.type,
      });
    }

    // Recalculate neighbors for affected area

    if (blocks.length > 0) {
      this.store.recalculateClusters();
      this.store.pruneEmptyTopLayers();
    }

    return clusterBlocks;
  }

  /**
   * Apply wobble to a voxel
   */
  addWobble(x: number, y: number, z: number, amount: number): void {
    const voxel = this.store.get(x, y, z);
    if (voxel && !voxel.hasBottomNeighbor) {
      voxel.wobble = Math.min(1.0, voxel.wobble + amount);
    }
  }

  /**
   * Decay wobble for all voxels (call every frame)
   */
  decayWobble(delta: number): void {
    const decayRate = STABILITY_CONFIG.wobbleDecayRate * delta;
    for (const voxel of this.store.getAllVoxels()) {
      if (!voxel.hasBottomNeighbor && voxel.wobble > 0) {
        voxel.wobble = Math.max(0, voxel.wobble - decayRate);
      }
    }
  }

  // === Accessors ===

  get lowestY(): number {
    return this.store.lowestY;
  }

  get highestY(): number {
    return this.store.highestY;
  }

  get store_(): VoxelDataStore {
    return this.store;
  }

  // === Chunk/Rendering Support ===

  consumeDirtyChunks(): number[] {
    return this.store.consumeDirtyChunks();
  }

  hasDirtyChunks(): boolean {
    return this.store.hasDirtyChunks();
  }

  getChunkId(y: number): number {
    return this.store.getChunkId(y);
  }

  getChunkBounds(chunkId: number): { minY: number; maxY: number } {
    return this.store.getChunkBounds(chunkId);
  }

  markAllDirty(): void {
    this.store.markAllDirty();
  }

  // === Stability Helpers ===

  /**
   * Queue a stability check at position (used by event listeners)
   */
  queueStabilityCheck(x: number, y: number, z: number): void {
    // This is a passthrough - actual stability checking is done by StabilitySystem
    // which queries the proxy
    this.store.recalculateNeighbors(x, y, z);
  }

  /**
   * Check if position is on perimeter
   */
  isPerimeter(x: number, z: number): boolean {
    return this.store.isPerimeter(x, z);
  }

  /**
   * Check if Y is at bottom layer
   */
  isBottomLayer(y: number): boolean {
    return this.store.isBottomLayer(y);
  }

  // === Floating Origin ===

  applyFloatingOriginOffset(offset: number): void {
    this.store.applyYOffset(offset);
  }
}
