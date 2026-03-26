import * as THREE from 'three';
import { BlockType, GRID, type DamageSource } from '../core/Types';
import { VoxelDataStore } from './VoxelDataStore';
import { VoxelWorldProxy } from './VoxelWorldProxy';
import { WorldGenerator } from './WorldGenerator';
import { VoxelRenderer } from '../rendering/VoxelRenderer';
import { type VoxelData, type ClusterBlockData, type DamageResult } from './types';
import { getExposureBrightness } from './exposure';

/**
 * VoxelWorld - Main orchestrator combining data, generation, and rendering
 * This is the primary interface for game systems to interact with the voxel world
 * 
 * Replaces the old VoxelColumn "god object" with a clean, modular architecture:
 * - VoxelDataStore: Pure data management
 * - VoxelWorldProxy: Game logic facade
 * - WorldGenerator: Procedural generation
 * - VoxelRenderer: Three.js visualization
 */
export class VoxelWorld {
  private store: VoxelDataStore;
  private proxy: VoxelWorldProxy;
  private generator: WorldGenerator;
  private renderer: VoxelRenderer;
  private _isExtending: boolean = false;
  private readonly raycastBounds = new THREE.Box3();
  private readonly raycastBoundsMin = new THREE.Vector3();
  private readonly raycastBoundsMax = new THREE.Vector3();
  private readonly raycastHitPoint = new THREE.Vector3();
  private readonly raycastCellBox = new THREE.Box3();
  private readonly raycastCellMin = new THREE.Vector3();
  private readonly raycastCellMax = new THREE.Vector3();

  constructor() {
    this.store = new VoxelDataStore(GRID.chunkHeight);
    this.proxy = new VoxelWorldProxy(this.store);
    this.generator = new WorldGenerator(this.store);
    this.renderer = new VoxelRenderer(this.store);
  }

  /**
   * Returns true if the world is currently being extended (generating new blocks)
   * Stability checks should be deferred during this time
   */
  get isExtending(): boolean {
    return this._isExtending;
  }

  // === Initialization ===

  /**
   * Generate initial world column
   */
  generateInitialColumn(): void {
    this.generator.generateInitialColumn();
    this.renderer.syncMeshes();
  }

  /**
   * Extend world depth if needed
   */
  extendColumn(targetDepth: number): void {
    this._isExtending = true;
    try {
      this.generator.extendTo(targetDepth);
      this.renderer.syncMeshes();
      
      // Recalculate clusters with the new bottom layer as anchor
      this.store.recalculateClusters();
    } finally {
      this._isExtending = false;
    }
  }

  // === Three.js Integration ===

  /**
   * Get the Three.js group containing all voxel meshes
   */
  get group(): THREE.Group {
    return this.renderer.group;
  }

  // === Frame Update ===

  /**
   * Update instanced meshes if dirty - call every frame
   */
  updateInstancedMeshes(): void {
    this.renderer.syncMeshes();
  }

  /**
   * Update chunk visibility based on camera - call every frame
   */
  updateChunkVisibility(camera: THREE.Camera): void {
    this.renderer.updateVisibility(camera);
  }

  /**
   * Update shaking/wobble animations - call every frame
   */
  updateShaking(delta: number): void {
    this.renderer.updateAnimations(delta);
    this.renderer.updateWobble(delta);
  }

  /**
   * Decay wobble for floating blocks - call every frame
   */
  updateWobbleDecay(delta: number): void {
    this.proxy.decayWobble(delta);
  }

  // === Block Queries ===

  /**
   * Get block at position
   */
  getBlock(x: number, y: number, z: number): VoxelData | undefined {
    return this.proxy.getVoxel(x, y, z);
  }

  /**
   * Get average surface depth from data store
   */
  getAverageSurfaceDepth(): number {
    return this.store.getAverageSurfaceDepth();
  }

  /**
   * Get block including dying ones (for animation)
   */
  getBlockIncludingDying(x: number, y: number, z: number): VoxelData | undefined {
    return this.proxy.getVoxelIncludingDying(x, y, z);
  }

  getUnstableProgress(x: number, y: number, z: number): { hitCount: number; heat: number } | null {
    return this.proxy.getUnstableProgress(x, y, z);
  }

  /**
   * Get all blocks
   */
  getAllBlocks(): VoxelData[] {
    return this.proxy.getAllVoxels();
  }

  /**
   * Get neighbors of a position
   */
  getNeighbors(x: number, y: number, z: number): VoxelData[] {
    return this.proxy.getNeighbors(x, y, z);
  }

  /**
   * Check if block is interactable (can be mined)
   */
  isBlockInteractable(x: number, y: number, z: number): boolean {
    return this.proxy.isInteractable(x, y, z);
  }

  /**
   * Check if block is locked (surrounded)
   */
  isBlockLocked(x: number, y: number, z: number): boolean {
    return this.proxy.isLocked(x, y, z);
  }

  // === Block Mutations ===

  /**
   * Damage a block, returns destruction result
   */
  damageBlock(
    x: number,
    y: number,
    z: number,
    damage: number,
    hitPoint?: THREE.Vector3,
    source: DamageSource = 'system'
  ): DamageResult {
    const result = this.proxy.damage(x, y, z, damage, hitPoint, source);

    if (result.destroyed) {
      // Trigger fade-out animation, then remove
      const shouldFlash = !!hitPoint;
      this.renderer.animateFadeOut(x, y, z, 0.1, () => {
        this.proxy.finalizeRemoval(x, y, z);
      }, shouldFlash);
    }

    return result;
  }

  /**
   * Remove block immediately (no animation)
   */
  removeBlock(x: number, y: number, z: number): VoxelData | undefined {
    return this.proxy.removeImmediate(x, y, z);
  }

  /**
   * Set a block at position
   */
  setBlock(x: number, y: number, z: number, type: BlockType): void {
    this.store.set(x, y, z, type);
    this.store.recalculateNeighbors(x, y, z);
  }

  /**
   * Set block from existing data (for cluster landing)
   */
  setBlockFromData(data: {
    type: BlockType;
    hp: number;
    initialHp: number;
    droppableItems?: Map<string, number>;
    x: number;
    y: number;
    z: number;
    isStatic: boolean;
    rotXIndex?: number;
    rotYIndex?: number;
    rotZIndex?: number;
    unstableHitCount?: number;
    unstableHeat?: number;
  }): void {
    this.proxy.placeFromData(data as any);
  }

  registerUnstableToolHit(x: number, y: number, z: number, hitPoint?: THREE.Vector3): { hitCount: number; heat: number } | null {
    return this.proxy.registerUnstableToolHit(x, y, z, hitPoint);
  }

  // === Cluster System Support ===

  /**
   * Get connected cluster from a starting block
   */
  getConnectedCluster(block: VoxelData): { blocks: VoxelData[]; isAnchored: boolean } {
    return this.proxy.getConnectedCluster(block);
  }

  /**
   * Extract blocks for a falling cluster
   */
  extractClusterBlocks(blocks: VoxelData[]): ClusterBlockData[] {
    return this.proxy.extractClusterBlocks(blocks);
  }

  // === Raycasting ===

  /**
   * Get raycast targets (meshes)
   */
  getRaycastTargets(): THREE.Object3D[] {
    return this.renderer.getRaycastTargets();
  }

  /**
   * Get block from raycast intersection
   */
  getBlockFromIntersection(intersection: THREE.Intersection): VoxelData | undefined {
    return this.renderer.getVoxelFromIntersection(intersection);
  }

  /**
   * Grid raycast against logical 1x1x1 voxel cubes (centered at voxel centers)
   * Uses DDA traversal so selection is independent from visual mesh shape.
   */
  raycastBlockByCube(
    ray: THREE.Ray,
    maxDistance: number
  ): { block: VoxelData; point: THREE.Vector3; distance: number } | null {
    if (maxDistance <= 0) return null;

    const lowestY = this.lowestYValue;
    const highestY = this.highestYValue;

    this.raycastBoundsMin.set(GRID.minX - 0.5, lowestY - 0.5, GRID.minZ - 0.5);
    this.raycastBoundsMax.set(GRID.maxX + 0.5, highestY + 0.5, GRID.maxZ + 0.5);
    this.raycastBounds.set(this.raycastBoundsMin, this.raycastBoundsMax);

    const dir = ray.direction;
    const origin = ray.origin;
    const eps = 1e-6;

    let tMin = 0;
    let tMax = maxDistance;

    // Slab clip against world bounds
    const clipAxis = (
      originValue: number,
      dirValue: number,
      minValue: number,
      maxValue: number
    ): boolean => {
      if (Math.abs(dirValue) < eps) {
        return originValue >= minValue && originValue <= maxValue;
      }

      let axisMin = (minValue - originValue) / dirValue;
      let axisMax = (maxValue - originValue) / dirValue;
      if (axisMin > axisMax) {
        const temp = axisMin;
        axisMin = axisMax;
        axisMax = temp;
      }

      tMin = Math.max(tMin, axisMin);
      tMax = Math.min(tMax, axisMax);
      return tMin <= tMax;
    };

    if (!clipAxis(origin.x, dir.x, this.raycastBoundsMin.x, this.raycastBoundsMax.x)) return null;
    if (!clipAxis(origin.y, dir.y, this.raycastBoundsMin.y, this.raycastBoundsMax.y)) return null;
    if (!clipAxis(origin.z, dir.z, this.raycastBoundsMin.z, this.raycastBoundsMax.z)) return null;

    if (tMax < 0) return null;

    const gridWidth = Math.round(GRID.maxX - GRID.minX + 1);
    const gridDepth = Math.round(GRID.maxZ - GRID.minZ + 1);
    const gridHeight = Math.max(0, Math.round(highestY - lowestY + 1));
    if (gridHeight <= 0) return null;

    const xOffset = GRID.minX - 0.5;
    const yOffset = lowestY - 0.5;
    const zOffset = GRID.minZ - 0.5;

    const startDistance = Math.max(0, tMin) + eps;
    const startX = origin.x + dir.x * startDistance;
    const startY = origin.y + dir.y * startDistance;
    const startZ = origin.z + dir.z * startDistance;

    let cellX = Math.floor(startX - xOffset);
    let cellY = Math.floor(startY - yOffset);
    let cellZ = Math.floor(startZ - zOffset);

    const stepX = dir.x > 0 ? 1 : dir.x < 0 ? -1 : 0;
    const stepY = dir.y > 0 ? 1 : dir.y < 0 ? -1 : 0;
    const stepZ = dir.z > 0 ? 1 : dir.z < 0 ? -1 : 0;

    const nextBoundaryX = xOffset + (stepX > 0 ? cellX + 1 : cellX);
    const nextBoundaryY = yOffset + (stepY > 0 ? cellY + 1 : cellY);
    const nextBoundaryZ = zOffset + (stepZ > 0 ? cellZ + 1 : cellZ);

    let tNextX = stepX !== 0 ? (nextBoundaryX - origin.x) / dir.x : Infinity;
    let tNextY = stepY !== 0 ? (nextBoundaryY - origin.y) / dir.y : Infinity;
    let tNextZ = stepZ !== 0 ? (nextBoundaryZ - origin.z) / dir.z : Infinity;

    const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;

    let currentT = startDistance;

    while (currentT <= tMax + eps) {
      const withinGrid =
        cellX >= 0 && cellX < gridWidth &&
        cellY >= 0 && cellY < gridHeight &&
        cellZ >= 0 && cellZ < gridDepth;

      if (withinGrid) {
        const worldX = GRID.minX + cellX;
        const worldY = lowestY + cellY;
        const worldZ = GRID.minZ + cellZ;

        const block = this.getBlock(worldX, worldY, worldZ);
        if (block && block.type !== BlockType.AIR && block.type !== BlockType.BEDROCK) {
          this.raycastCellMin.set(worldX - 0.5, worldY - 0.5, worldZ - 0.5);
          this.raycastCellMax.set(worldX + 0.5, worldY + 0.5, worldZ + 0.5);
          this.raycastCellBox.set(this.raycastCellMin, this.raycastCellMax);

          const hit = ray.intersectBox(this.raycastCellBox, this.raycastHitPoint);
          if (hit) {
            const distance = hit.distanceTo(origin);
            if (distance <= maxDistance + eps) {
              return {
                block,
                point: hit.clone(),
                distance,
              };
            }
          }
        }
      }

      if (tNextX <= tNextY && tNextX <= tNextZ) {
        cellX += stepX;
        currentT = tNextX;
        tNextX += tDeltaX;
      } else if (tNextY <= tNextX && tNextY <= tNextZ) {
        cellY += stepY;
        currentT = tNextY;
        tNextY += tDeltaY;
      } else {
        cellZ += stepZ;
        currentT = tNextZ;
        tNextZ += tDeltaZ;
      }
    }

    return null;
  }

  // === Visual Effects ===

  /**
   * Set highlight color on a block
   */
  setBlockColor(x: number, y: number, z: number, r: number, g: number, b: number): void {
    const voxel = this.getBlock(x, y, z);
    if (!voxel) return;
    if (voxel.exposureDistance > 0) return;
    this.renderer.setVoxelColor(x, y, z, r, g, b);
  }

  /**
   * Reset block color to its default state (unlocked = 1.0, locked = 0.5)
   */
  resetBlockColor(x: number, y: number, z: number): void {
    const voxel = this.getBlock(x, y, z);
    if (!voxel) return;

    const brightness = getExposureBrightness(voxel.exposureDistance, voxel.isVisible);
    this.renderer.setVoxelColor(x, y, z, brightness, brightness, brightness);
  }

  /**
   * Trigger shake/pop animation on a block
   */
  shakeBlock(
    x: number,
    y: number,
    z: number,
    duration: number = 0.15,
    targetScale: number = 0.8,
    shouldFlash: boolean = true
  ): void {
    if (targetScale === 0) {
      // Fade out animation
      this.renderer.animateFadeOut(x, y, z, duration, undefined, shouldFlash);
    } else {
      // Pop animation
      this.renderer.animatePop(x, y, z, duration, targetScale, shouldFlash);
    }
  }

  // === Bounds ===

  get highestYValue(): number {
    return this.proxy.highestY;
  }

  get lowestYValue(): number {
    return this.proxy.lowestY;
  }

  // === Stability Helpers ===

  isPerimeter(x: number, z: number): boolean {
    return this.proxy.isPerimeter(x, z);
  }

  isBottomLayer(y: number): boolean {
    return this.proxy.isBottomLayer(y);
  }

  queueStabilityCheck(x: number, y: number, z: number): void {
    this.proxy.queueStabilityCheck(x, y, z);
  }

  /**
   * Get the chunk ID for a given Y coordinate
   */
  getChunkId(y: number): number {
    return this.store.getChunkId(y);
  }

  // === Floating Origin ===

  applyFloatingOriginOffset(offset: number): void {
    this.proxy.applyFloatingOriginOffset(offset);
    this.renderer.rebuildAll();
  }

  // === Cleanup ===

  dispose(): void {
    this.renderer.dispose();
    this.store.clear();
  }
}

// Re-export types for convenience
export type { VoxelData, ClusterBlockData, DamageResult } from './types';
