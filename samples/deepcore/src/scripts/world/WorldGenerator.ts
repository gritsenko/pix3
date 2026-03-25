import { BlockType, GRID, GameEvents, emitGameEvent } from '../core/Types';
import { VoxelDataStore } from './VoxelDataStore';


/**
 * Procedural world generation - depth-based block type selection
 * Extracted from VoxelColumn for single responsibility
 */
export class WorldGenerator {
  constructor(private store: VoxelDataStore) { }

  /**
   * Generate initial column from Y=0 down to -initialHeight
   */
  generateInitialColumn(): void {
    const startY = 0;
    const endY = -GRID.initialHeight;

    for (let y = startY; y >= endY; y--) {
      this.generateLayer(y);
    }

    this.store.setLowestY(endY);

    // Recalculate all neighbor stats after generation
    this.store.recalculateAllNeighbors();
  }

  /**
   * Extend column downward to reach target depth
   */
  extendTo(targetDepth: number): void {
    const targetY = -Math.abs(targetDepth);

    while (this.store.lowestY > targetY) {
      const newY = this.store.lowestY - 1;
      this.generateLayer(newY);
      this.store.setLowestY(newY);
    }
  }

  /**
   * Generate a single layer at Y coordinate
   */
  generateLayer(y: number): void {
    for (let x = GRID.minX; x <= GRID.maxX; x++) {
      for (let z = GRID.minZ; z <= GRID.maxZ; z++) {
        const type = this.selectBlockType(x, y, z);
        if (type !== BlockType.AIR) {
          const voxel = this.store.set(x, y, z, type);
          // Calculate neighbors for new block
          this.store.updateNeighborStats(voxel);

          emitGameEvent(GameEvents.BLOCK_PLACED, {
            x,
            y,
            z,
            blockType: type,
          });
        }
      }
    }
  }


  /**
   * Depth-based procedural block type selection
   * All blocks are destructible - no bedrock perimeter
   */
  private selectBlockType(_x: number, y: number, _z: number): BlockType {
    const depth = -y;
    const random = Math.random();

    // Small chance for unstable blocks anywhere below surface
    if (depth >= 0 && Math.random() < 0.05) {
      return BlockType.UNSTABLE;
    }

    // Surface layers (0-5): mostly dirt
    if (depth < 5) {
      return random < 0.85 ? BlockType.DIRT : BlockType.STONE;
    }

    // Shallow (5-15): dirt/stone mix with iron
    if (depth < 15) {
      if (random < 0.35) return BlockType.DIRT;
      if (random < 0.92) return BlockType.STONE;
      return BlockType.IRON_ORE;
    }

    // Medium (15-30): stone with ores
    if (depth < 30) {
      if (random < 0.15) return BlockType.DIRT;
      if (random < 0.7) return BlockType.STONE;
      if (random < 0.88) return BlockType.IRON_ORE;
      return BlockType.GOLD_ORE;
    }

    // Deep (30+): valuable ores increase
    if (random < 0.08) return BlockType.DIRT;
    if (random < 0.45) return BlockType.STONE;
    if (random < 0.68) return BlockType.IRON_ORE;
    if (random < 0.88) return BlockType.GOLD_ORE;
    return BlockType.DIAMOND_ORE;
  }
}
