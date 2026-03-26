import { BlockType, BLOCK_PROPERTIES, GRID, EXPOSURE } from '../core/Types';
import { type VoxelData, voxelKey, NEIGHBOR_OFFSETS, SIDE_OFFSETS } from './types';
import { BLOCK_DROPPED_ITEMS } from '../config/blocks';

const MAX_EXPOSURE_DISTANCE = EXPOSURE.maxDistance;
const EXPOSURE_RANGE_PADDING = 2;

/**
 * Pure data store for voxel world - NO rendering logic
 * Handles block storage, neighbor queries, and dirty tracking
 */
export class VoxelDataStore {
  private data: Map<string, VoxelData> = new Map();
  private _lowestY: number = Infinity;
  private _highestY: number = -Infinity;

  // Observable dirty regions (chunk IDs that changed)
  private dirtyChunks: Set<number> = new Set();
  private chunkHeight: number;

  constructor(chunkHeight: number = GRID.chunkHeight) {
    this.chunkHeight = chunkHeight;
  }

  private calculateDamageStageFromHp(hp: number, maxHp: number): number {
    const DAMAGE_MASK_STEPS = 10;
    if (!Number.isFinite(maxHp) || maxHp <= 0 || DAMAGE_MASK_STEPS <= 1) {
      return 0;
    }

    const clampedHp = Math.max(0, hp);
    const normalized = 1 - Math.min(1, clampedHp / maxHp);
    return Math.min(DAMAGE_MASK_STEPS - 1, Math.max(0, normalized * (DAMAGE_MASK_STEPS - 1)));
  }

  private updateDamageStage(voxel: VoxelData): void {
    voxel.damageStage = this.calculateDamageStageFromHp(voxel.hp, voxel.initialHp);
  }

  public refreshDamageStage(voxel: VoxelData): void {
    this.updateDamageStage(voxel);
  }

  // === Core CRUD ===

  get(x: number, y: number, z: number): VoxelData | undefined {
    const voxel = this.data.get(voxelKey(x, y, z));
    if (voxel?.isDying) return undefined;
    return voxel;
  }

  /**
   * Get voxel even if it's dying (for animation purposes)
   */
  getIncludingDying(x: number, y: number, z: number): VoxelData | undefined {
    return this.data.get(voxelKey(x, y, z));
  }

  set(x: number, y: number, z: number, type: BlockType): VoxelData {
    const key = voxelKey(x, y, z);
    const props = BLOCK_PROPERTIES[type];

    // Initialize droppable items from config (handles decimal probabilities)
    const droppableItems = new Map<string, number>();
    const itemsConfig = BLOCK_DROPPED_ITEMS[type] || {};
    for (const [itemType, quantity] of Object.entries(itemsConfig)) {
      if (quantity > 0) {
        // If quantity is decimal (e.g. 0.2), use it as a probability for 1 drop
        if (quantity < 1) {
          if (Math.random() < quantity) {
            droppableItems.set(itemType, 1);
          }
        } else {
          droppableItems.set(itemType, Math.floor(quantity));
        }
      }
    }

    const voxel: VoxelData = {
      type,
      hp: props.hp,
      initialHp: props.hp,
      droppableItems,
      x,
      y,
      z,
      // Compute and store rotation indices if block supports random rotation
      rotXIndex: props.randomRotation ? (Math.abs(Math.floor(x * 73856093) ^ Math.floor(y * 19349663) ^ Math.floor(z * 83492791)) % 4) : undefined,
      rotYIndex: props.randomRotation ? (Math.floor(Math.abs(Math.floor(x * 73856093) ^ Math.floor(y * 19349663) ^ Math.floor(z * 83492791)) / 4) % 4) : undefined,
      rotZIndex: props.randomRotation ? (Math.floor(Math.abs(Math.floor(x * 73856093) ^ Math.floor(y * 19349663) ^ Math.floor(z * 83492791)) / 16) % 4) : undefined,
      isStatic: true,
      isDying: false,
      sideNeighborCount: 0,
      hasSideNeighbors: false,
      hasBottomNeighbor: false,
      clusterId: 0,
      gripForce: props.gripForce,
      wobble: 0,
      integrity: 100,
      maxIntegrity: 100,
      isLocked: false,
      isVisible: true,
      exposureDistance: MAX_EXPOSURE_DISTANCE,
      damageStage: 0,
      unstableHitCount: 0,
      unstableHeat: 0,
    };

    this.refreshDamageStage(voxel);

    this.data.set(key, voxel);
    this.markDirty(y);
    this.updateBounds(y);

    return voxel;
  }

  /**
   * Set voxel with existing data (for cluster landing, restoring blocks)
   */
setFromData(data: Partial<VoxelData> & { x: number; y: number; z: number; type: BlockType }): VoxelData {
    const voxel = this.set(data.x, data.y, data.z, data.type);

    // Override with provided data
    if (data.hp !== undefined) voxel.hp = data.hp;
    if (data.initialHp !== undefined) voxel.initialHp = data.initialHp;
    if (data.droppableItems !== undefined) voxel.droppableItems = new Map(data.droppableItems);
    if (data.isStatic !== undefined) voxel.isStatic = data.isStatic;
    if (data.wobble !== undefined) voxel.wobble = data.wobble;
    if (data.integrity !== undefined) voxel.integrity = data.integrity;
    if (data.maxIntegrity !== undefined) voxel.maxIntegrity = data.maxIntegrity;
    if (data.exposureDistance !== undefined) voxel.exposureDistance = data.exposureDistance;
    if (data.unstableHitCount !== undefined) voxel.unstableHitCount = data.unstableHitCount;
    if (data.unstableHeat !== undefined) voxel.unstableHeat = data.unstableHeat;

    // Restore rotation indices if provided (preserve original orientation)
    if ((data as any).rotXIndex !== undefined) voxel.rotXIndex = (data as any).rotXIndex;
    if ((data as any).rotYIndex !== undefined) voxel.rotYIndex = (data as any).rotYIndex;
    if ((data as any).rotZIndex !== undefined) voxel.rotZIndex = (data as any).rotZIndex;

    // Recalculate damageStage from current hp/initialHp (important after falling cluster impact)
    this.refreshDamageStage(voxel);

    return voxel;
}

  remove(x: number, y: number, z: number): VoxelData | undefined {
    const key = voxelKey(x, y, z);
    const voxel = this.data.get(key);
    if (!voxel) return undefined;

    this.data.delete(key);
    this.markDirty(voxel.y);

    return voxel;
  }

  has(x: number, y: number, z: number): boolean {
    const voxel = this.data.get(voxelKey(x, y, z));
    return voxel !== undefined && !voxel.isDying;
  }

  // === Queries ===

  getNeighbors(x: number, y: number, z: number): VoxelData[] {
    const neighbors: VoxelData[] = [];
    for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
      const n = this.get(x + dx, y + dy, z + dz);
      if (n) neighbors.push(n);
    }
    return neighbors;
  }

  /**
   * Check if a voxel has at least one exposed face (not surrounded)
   */
  isExposed(x: number, y: number, z: number): boolean {
    for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
      const nx = x + dx;
      const nz = z + dz;
      // Perimeter faces are not considered exposed (embedded in wall)
      if (nx < GRID.minX || nx > GRID.maxX || nz < GRID.minZ || nz > GRID.maxZ) continue;
      const n = this.get(nx, y + dy, nz);
      if (!n || n.type === BlockType.AIR) return true;
    }
    return false;
  }

  /**
   * Check if position is on the grid perimeter
   */
  isPerimeter(x: number, z: number): boolean {
    return x === GRID.minX || x === GRID.maxX || z === GRID.minZ || z === GRID.maxZ;
  }

  /**
   * Check if Y is at the bottom layer (foundation)
   */
  isBottomLayer(y: number): boolean {
    return y <= this._lowestY + 1;
  }

  getAllVoxels(): VoxelData[] {
    return Array.from(this.data.values()).filter((v) => !v.isDying);
  }

  /**
   * Get all voxels including dying ones (for rendering)
   */
  getAllVoxelsIncludingDying(): VoxelData[] {
    return Array.from(this.data.values());
  }

  getVoxelsInYRange(minY: number, maxY: number, includeDying: boolean = false): VoxelData[] {
    const list = includeDying ? Array.from(this.data.values()) : this.getAllVoxels();
    return list.filter((v) => v.y >= minY && v.y <= maxY);
  }

  /**
   * Check if a layer at Y is completely empty
   */
  isLayerEmpty(y: number): boolean {
    for (let x = GRID.minX; x <= GRID.maxX; x++) {
      for (let z = GRID.minZ; z <= GRID.maxZ; z++) {
        const voxel = this.get(x, y, z);
        if (voxel && voxel.type !== BlockType.AIR) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Calculates the Average Surface Depth (ASD).
   * ASD is the arithmetic mean of the height (as depth) of all top-most blocks in each column.
   * depth = -y
   */
  getAverageSurfaceDepth(): number {
    let totalDepth = 0;
    let columnCount = 0;

    for (let x = GRID.minX; x <= GRID.maxX; x++) {
      for (let z = GRID.minZ; z <= GRID.maxZ; z++) {
        let highestYInColumn = -Infinity;
        // Search from top down for the first non-air block
        for (let y = this._highestY; y >= this._lowestY; y--) {
          const voxel = this.get(x, y, z);
          if (voxel && voxel.type !== BlockType.AIR && !voxel.isDying) {
            highestYInColumn = y;
            break;
          }
        }

        if (highestYInColumn !== -Infinity) {
          totalDepth += (-highestYInColumn);
          columnCount++;
        }
      }
    }

    return columnCount > 0 ? totalDepth / columnCount : 0;
  }

  // === Neighbor Statistics ===

  /**
   * Recalculate neighbor stats for a voxel and its neighbors
   */
  recalculateNeighbors(x: number, y: number, z: number): void {
    const affected: VoxelData[] = [];
    const secondShell = new Set<VoxelData>();

    const voxel = this.getIncludingDying(x, y, z) || this.get(x, y, z);
    if (voxel) affected.push(voxel);

    for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
      const n = this.getIncludingDying(x + dx, y + dy, z + dz) || this.get(x + dx, y + dy, z + dz);
      if (n) {
        affected.push(n);
        // Neighbors of neighbors might need visibility update
        for (const [dx2, dy2, dz2] of NEIGHBOR_OFFSETS) {
          const n2 = this.getIncludingDying(n.x + dx2, n.y + dy2, n.z + dz2) || this.get(n.x + dx2, n.y + dy2, n.z + dz2);
          if (n2) secondShell.add(n2);
        }
      }
    }

    // Pass 1: Update standard stats and isLocked
    for (const v of affected) {
      this.updateNeighborStats(v);
    }

    // Pass 1.5: Update exposure distance gradient in a local range
    this.propagateExposure(x, y, z);

    // Pass 2: Update isVisible for everyone in the reach
    for (const v of affected) {
      this.updateVisibilityFlag(v);
    }
    for (const v of secondShell) {
      if (!affected.includes(v)) {
        this.updateVisibilityFlag(v);
      }
    }

    // Pass 3: Mark all involved chunks dirty
    for (const v of affected) {
      this.markChunkDirty(this.getChunkId(v.y));
    }
    for (const v of secondShell) {
      this.markChunkDirty(this.getChunkId(v.y));
    }

    // Also mark the original position's chunk dirty even if empty
    this.markChunkDirty(this.getChunkId(y));
  }

  /**
   * Update isVisible flag based on locked status and neighbors
   */
  private updateVisibilityFlag(voxel: VoxelData): void {
    if (!voxel.isLocked) {
      voxel.isVisible = true;
      return;
    }

    // If locked, it's visible only if it has an unlocked neighbor or exposed face
    let hasUnlockedNeighbor = false;
    for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
      const nx = voxel.x + dx;
      const nz = voxel.z + dz;
      // Skip perimeter checks
      if (nx < GRID.minX || nx > GRID.maxX || nz < GRID.minZ || nz > GRID.maxZ) continue;

      const n = this.get(nx, voxel.y + dy, nz);
      // Visible if neighbor is missing/AIR or if neighbor is unlocked
      if (!n || n.type === BlockType.AIR || !n.isLocked) {
        hasUnlockedNeighbor = true;
        break;
      }
    }
    voxel.isVisible = hasUnlockedNeighbor;
  }

  /**
   * Update neighbor statistics for a single voxel
   */
  updateNeighborStats(voxel: VoxelData): void {
    let sideCount = 0;
    for (const [dx, _, dz] of SIDE_OFFSETS) {
      const n = this.get(voxel.x + dx, voxel.y, voxel.z + dz);
      if (n && n.type !== BlockType.AIR) sideCount++;
    }
    voxel.sideNeighborCount = sideCount;
    voxel.hasSideNeighbors = sideCount > 0;

    const bottom = this.get(voxel.x, voxel.y - 1, voxel.z);
    voxel.hasBottomNeighbor = !!bottom && bottom.type !== BlockType.AIR;

    // Update isLocked
    voxel.isLocked = !this.isExposed(voxel.x, voxel.y, voxel.z);
    if (!voxel.isLocked) {
      voxel.exposureDistance = 0;
    } else {
      voxel.exposureDistance = MAX_EXPOSURE_DISTANCE;
    }
  }

  /**
   * Propagate exposure distance in a localized region using BFS.
   */
  propagateExposure(centerX: number, centerY: number, centerZ: number): void {
    const range = MAX_EXPOSURE_DISTANCE + EXPOSURE_RANGE_PADDING;
    const minX = Math.max(GRID.minX, centerX - range);
    const maxX = Math.min(GRID.maxX, centerX + range);
    const minZ = Math.max(GRID.minZ, centerZ - range);
    const maxZ = Math.min(GRID.maxZ, centerZ + range);
    const minY = centerY - range;
    const maxY = centerY + range;

    const queue: VoxelData[] = [];
    const visited = new Set<string>();

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          const v = this.get(x, y, z);
          if (!v || v.type === BlockType.AIR) continue;

          if (this.isExposed(x, y, z)) {
            v.exposureDistance = 0;
            v.isLocked = false;
            queue.push(v);
            visited.add(voxelKey(x, y, z));
          } else {
            v.exposureDistance = MAX_EXPOSURE_DISTANCE;
            v.isLocked = true;
          }
        }
      }
    }

    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      const newDist = current.exposureDistance + 1;
      if (newDist > MAX_EXPOSURE_DISTANCE) continue;

      for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        const nz = current.z + dz;

        if (nx < minX || nx > maxX || nz < minZ || nz > maxZ || ny < minY || ny > maxY) continue;

        const neighbor = this.get(nx, ny, nz);
        if (!neighbor || neighbor.type === BlockType.AIR) continue;

        if (neighbor.exposureDistance > newDist) {
          neighbor.exposureDistance = newDist;
          const nKey = voxelKey(nx, ny, nz);
          if (!visited.has(nKey)) {
            visited.add(nKey);
            queue.push(neighbor);
          }
        }
      }
    }

    // Mark affected chunk range dirty for color updates
    const minChunk = this.getChunkId(minY);
    const maxChunk = this.getChunkId(maxY);
    for (let chunkId = minChunk; chunkId <= maxChunk; chunkId++) {
      this.markChunkDirty(chunkId);
    }
  }

  /**
   * Recalculate all neighbor stats (call after generation)
   */
  recalculateAllNeighbors(): void {
    // Pass 1: Stats and Locked status
    for (const voxel of this.data.values()) {
      this.updateNeighborStats(voxel);
    }
    // Pass 2: Visibility
    for (const voxel of this.data.values()) {
      this.updateVisibilityFlag(voxel);
    }

    // Pass 3: Global BFS for exposure distance
    const queue: VoxelData[] = [];
    for (const voxel of this.data.values()) {
      if (voxel.exposureDistance === 0) {
        queue.push(voxel);
      } else {
        voxel.exposureDistance = MAX_EXPOSURE_DISTANCE;
      }
    }

    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      const newDist = current.exposureDistance + 1;
      if (newDist > MAX_EXPOSURE_DISTANCE) continue;

      for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
        const n = this.get(current.x + dx, current.y + dy, current.z + dz);
        if (!n || n.type === BlockType.AIR) continue;
        if (n.exposureDistance > newDist) {
          n.exposureDistance = newDist;
          queue.push(n);
        }
      }
    }
  }

  // === Cluster Detection ===

  /**
   * Find connected cluster starting from a block
   * Returns the cluster blocks and whether it's anchored to ground/perimeter
   */
  getConnectedCluster(startVoxel: VoxelData): { blocks: VoxelData[]; isAnchored: boolean } {
    const cluster: VoxelData[] = [];
    const queue: VoxelData[] = [startVoxel];
    const visited = new Set<string>();

    visited.add(voxelKey(startVoxel.x, startVoxel.y, startVoxel.z));
    cluster.push(startVoxel);

    // Quick check: if start block is already an anchor, cluster is stable
    if (startVoxel.type === BlockType.BEDROCK || this.isBottomLayer(startVoxel.y)) {
      return { blocks: [], isAnchored: true };
    }

    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      const neighbors = this.getNeighbors(current.x, current.y, current.z);

      for (const neighbor of neighbors) {
        if (neighbor.type === BlockType.AIR || neighbor.isDying || !neighbor.isStatic) continue;

        // Integrity check: loose blocks don't bond horizontally
        if (neighbor.y === current.y) {
          if (current.integrity <= 0 || neighbor.integrity <= 0) continue;
        }

        // If neighbor is an anchor, entire cluster is stable
        if (neighbor.type === BlockType.BEDROCK || this.isBottomLayer(neighbor.y)) {
          return { blocks: [], isAnchored: true };
        }

        const key = voxelKey(neighbor.x, neighbor.y, neighbor.z);
        if (!visited.has(key)) {
          visited.add(key);
          cluster.push(neighbor);
          queue.push(neighbor);
        }
      }
    }

    // Reached here = traversed entire cluster without finding anchor
    return { blocks: cluster, isAnchored: false };
  }

  /**
   * Recalculate cluster IDs for all blocks using BFS from anchors
   */
  recalculateClusters(): void {
    const allVoxels = this.getAllVoxels();

    // Reset all cluster IDs
    for (const voxel of allVoxels) {
      voxel.clusterId = -1;
    }

    // BFS from anchors (bedrock, perimeter, bottom layer)
    const queue: VoxelData[] = [];
    const visited = new Set<string>();

    // Seed with anchor blocks
    for (const voxel of allVoxels) {
      if (voxel.type !== BlockType.AIR && !voxel.isDying) {
        if (
          voxel.type === BlockType.BEDROCK ||
          this.isPerimeter(voxel.x, voxel.z) ||
          voxel.hasBottomNeighbor
        ) {
          queue.push(voxel);
          visited.add(voxelKey(voxel.x, voxel.y, voxel.z));
          voxel.clusterId = 0;
        }
      }
    }

    // BFS to mark connected blocks as cluster 0 (stable)
    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = this.getNeighbors(current.x, current.y, current.z);

      for (const neighbor of neighbors) {
        if (neighbor.type === BlockType.AIR || neighbor.isDying) continue;

        if (neighbor.y === current.y) {
          if (current.integrity <= 0 || neighbor.integrity <= 0) continue;
        }

        const key = voxelKey(neighbor.x, neighbor.y, neighbor.z);
        if (!visited.has(key)) {
          visited.add(key);
          neighbor.clusterId = 0;
          queue.push(neighbor);
        }
      }
    }

    // Assign unique cluster IDs to disconnected blocks
    let nextClusterId = 1;
    for (const voxel of allVoxels) {
      if (voxel.type === BlockType.AIR || voxel.isDying || voxel.clusterId === 0) continue;
      if (voxel.clusterId !== -1) continue;

      // Start new cluster
      const clusterQueue: VoxelData[] = [voxel];
      voxel.clusterId = nextClusterId;
      const clusterVisited = new Set<string>([voxelKey(voxel.x, voxel.y, voxel.z)]);

      while (clusterQueue.length > 0) {
        const current = clusterQueue.shift()!;
        const neighbors = this.getNeighbors(current.x, current.y, current.z);

        for (const neighbor of neighbors) {
          if (neighbor.type === BlockType.AIR || neighbor.isDying || neighbor.clusterId !== -1)
            continue;

          if (neighbor.y === current.y) {
            if (current.integrity <= 0 || neighbor.integrity <= 0) continue;
          }

          const key = voxelKey(neighbor.x, neighbor.y, neighbor.z);
          if (!clusterVisited.has(key)) {
            clusterVisited.add(key);
            neighbor.clusterId = nextClusterId;
            clusterQueue.push(neighbor);
          }
        }
      }

      nextClusterId++;
    }
  }

  // === Dirty Tracking ===

  getChunkId(y: number): number {
    return Math.floor(y / this.chunkHeight);
  }

  getChunkBounds(chunkId: number): { minY: number; maxY: number } {
    const minY = chunkId * this.chunkHeight;
    return { minY, maxY: minY + this.chunkHeight - 1 };
  }

  private markDirty(y: number): void {
    this.dirtyChunks.add(this.getChunkId(y));
  }

  markChunkDirty(chunkId: number): void {
    this.dirtyChunks.add(chunkId);
  }

  markAllDirty(): void {
    for (const voxel of this.data.values()) {
      this.dirtyChunks.add(this.getChunkId(voxel.y));
    }
  }

  consumeDirtyChunks(): number[] {
    const chunks = Array.from(this.dirtyChunks);
    this.dirtyChunks.clear();
    return chunks;
  }

  hasDirtyChunks(): boolean {
    return this.dirtyChunks.size > 0;
  }

  // === Bounds ===

  get lowestY(): number {
    return this._lowestY === Infinity ? 0 : this._lowestY;
  }

  get highestY(): number {
    return this._highestY === -Infinity ? 0 : this._highestY;
  }

  setLowestY(y: number): void {
    this._lowestY = y;
  }

  private updateBounds(y: number): void {
    if (this._highestY === -Infinity) {
      this._highestY = y;
      this._lowestY = y;
    } else {
      this._highestY = Math.max(this._highestY, y);
      this._lowestY = Math.min(this._lowestY, y);
    }
  }

  /**
   * Prune empty layers from the top
   */
  pruneEmptyTopLayers(): void {
    if (this.data.size === 0) {
      this._highestY = -Infinity;
      this._lowestY = Infinity;
      return;
    }

    while (this._highestY > this._lowestY && this.isLayerEmpty(this._highestY)) {
      this._highestY--;
    }
  }

  // === Internal Helpers ===

  // === Floating Origin ===

  applyYOffset(offset: number): void {
    const newData = new Map<string, VoxelData>();
    for (const [_, voxel] of this.data) {
      voxel.y -= offset;
      newData.set(voxelKey(voxel.x, voxel.y, voxel.z), voxel);
    }
    this.data = newData;
    this._lowestY -= offset;
    this._highestY -= offset;
    this.markAllDirty();
  }

  // === Cleanup ===

  clear(): void {
    this.data.clear();
    this.dirtyChunks.clear();
    this._lowestY = 0;
    this._highestY = 0;
  }

  get size(): number {
    return this.data.size;
  }
}
