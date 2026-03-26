import { VoxelWorld, type VoxelData } from "../world";
import { BlockType } from "../core/Types";

export interface UnstableBlock {
  block: VoxelData;
  reason: "unstable" | "damage";
}

export class StabilitySystem {
  private voxelWorld: VoxelWorld;
  private pendingCheck: Set<string> = new Set();

  constructor(voxelWorld: VoxelWorld) {
    this.voxelWorld = voxelWorld;
  }

  queueCheck(x: number, y: number, z: number): void {
    this.pendingCheck.add(`${x},${y},${z}`);
  }

  checkStability(): UnstableBlock[] {
    const unstableResult: UnstableBlock[] = [];
    const processedBlocks = new Set<string>();

    if (this.pendingCheck.size === 0) return [];

    const positionsToCheck = Array.from(this.pendingCheck);
    this.pendingCheck.clear();

    for (const posKey of positionsToCheck) {
      const [x, y, z] = posKey.split(",").map(Number);
      
      const targetBlock = this.voxelWorld.getBlock(x, y, z);
      const candidates = targetBlock ? [targetBlock, ...this.voxelWorld.getNeighbors(x, y, z)] : this.voxelWorld.getNeighbors(x, y, z);

      for (const block of candidates) {
        if (!block || !block.isStatic || block.type === BlockType.AIR || block.isDying) {
          continue;
        }

        const blockKey = `${block.x},${block.y},${block.z}`;
        if (processedBlocks.has(blockKey)) {
          continue;
        }

        const { blocks: cluster, isAnchored } = this.voxelWorld.getConnectedCluster(block);
        for (const clusterBlock of cluster) {
          processedBlocks.add(`${clusterBlock.x},${clusterBlock.y},${clusterBlock.z}`);
        }

        if (!isAnchored) {
          for (const unstableBlock of cluster) {
            unstableResult.push({
              block: unstableBlock,
              reason: "unstable"
            });
          }
        }
      }
    }
    
    return unstableResult;
  }
  
  getUnstableClusters(): VoxelData[][] {
    const allUnstable = this.checkStability();
    if (allUnstable.length === 0) return [];

    const clusters: VoxelData[][] = [];
    const visited = new Set<string>();
    
    for (const item of allUnstable) {
      const key = `${item.block.x},${item.block.y},${item.block.z}`;
      if (visited.has(key)) continue;

      const { blocks: cluster } = this.voxelWorld.getConnectedCluster(item.block);
      for (const b of cluster) {
        visited.add(`${b.x},${b.y},${b.z}`);
      }
      clusters.push(cluster);
    }

    return clusters;
  }

  clearPending(): void {
    this.pendingCheck.clear();
  }

  update(deltaTime: number): void {
     const allBlocks = this.voxelWorld.getAllBlocks();
     const recovery = 10 * deltaTime; // Recover 10 integrity per second
     
     for (const block of allBlocks) {
        if (block.integrity < block.maxIntegrity) {
             block.integrity = Math.min(block.maxIntegrity, block.integrity + recovery);
        }
     }
  }
}

