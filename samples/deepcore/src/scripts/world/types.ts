import { BlockType } from '../core/Types';

/**
 * Pure voxel data - NO rendering details (instanceId, chunkId are internal to renderer)
 */
export interface VoxelData {
  type: BlockType;
  hp: number;
  initialHp: number;
  droppableItems: Map<string, number>;
  x: number;
  y: number;
  z: number;

  // Rendering rotation indices (0..3 steps of 90deg on each axis)
  rotXIndex?: number;
  rotYIndex?: number;
  rotZIndex?: number;

  // State flags
  isStatic: boolean;
  isDying: boolean;

  // Stability (domain logic, not rendering)
  sideNeighborCount: number;
  hasSideNeighbors: boolean;
  hasBottomNeighbor: boolean;
  clusterId: number;
  gripForce: number;
  wobble: number;
  integrity: number;
  maxIntegrity: number;

  // Debug/Visibility flags
  isLocked: boolean;
  isVisible: boolean;

  // Damage mask stage (0 = pristine, max = fully cracked)
  damageStage: number;

  // Unstable block progression (used only by BlockType.UNSTABLE)
  unstableHitCount: number;
  unstableHeat: number;

  // Exposure distance (0 = exposed to air, 1 = neighbor of exposed, etc.)
  exposureDistance: number;
}

/**
 * Cluster block data for falling clusters
 */
export interface ClusterBlockData {
  type: BlockType;
  hp: number;
  initialHp: number;
  droppableItems: Map<string, number>;
  gridX: number;
  gridY: number;
  gridZ: number;
  localX: number;
  localY: number;
  localZ: number;

  // Preserve rotation indices from original block so that landing keeps initial orientation
  rotXIndex?: number;
  rotYIndex?: number;
  rotZIndex?: number;
  soilBreakthroughUsed?: boolean;
  unstableHitCount?: number;
  unstableHeat?: number;
}

/**
 * Result of damaging a voxel
 */
export interface DamageResult {
  destroyed: boolean;
  remaining: number;
  droppedQuantity: number;
  destroyedVoxelType?: BlockType;
}

/**
 * Coordinate key helper
 */
export function voxelKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

/**
 * Parse coordinate key back to numbers
 */
export function parseVoxelKey(key: string): [number, number, number] {
  const [x, y, z] = key.split(',').map(Number);
  return [x, y, z];
}

/**
 * Neighbor offset type
 */
export type NeighborOffset = [number, number, number];

/**
 * All 6 neighbor offsets (±X, ±Y, ±Z)
 */
export const NEIGHBOR_OFFSETS: NeighborOffset[] = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
];

/**
 * Side neighbor offsets only (±X, ±Z) - no vertical
 */
export const SIDE_OFFSETS: NeighborOffset[] = [
  [1, 0, 0], [-1, 0, 0],
  [0, 0, 1], [0, 0, -1],
];

/**
 * Calculate deterministic rotation seed from block coordinates
 * Used for consistent random rotations across rendering and physics
 */
export function getBlockRotationSeed(x: number, y: number, z: number): number {
  return Math.abs(Math.floor(x * 73856093) ^ Math.floor(y * 19349663) ^ Math.floor(z * 83492791));
}

/**
 * Get rotation indices (0-3) for each axis from block coordinates
 */
export function getBlockRotationIndices(x: number, y: number, z: number): { rotX: number; rotY: number; rotZ: number } {
  const seed = getBlockRotationSeed(x, y, z);
  return {
    rotX: seed % 4,
    rotY: Math.floor(seed / 4) % 4,
    rotZ: Math.floor(seed / 16) % 4
  };
}

/**
 * Get rotation angles (in radians) for each axis from block coordinates
 */
export function getBlockRotationAngles(x: number, y: number, z: number): { rotX: number; rotY: number; rotZ: number } {
  const indices = getBlockRotationIndices(x, y, z);
  return {
    rotX: indices.rotX * (Math.PI / 2),
    rotY: indices.rotY * (Math.PI / 2),
    rotZ: indices.rotZ * (Math.PI / 2)
  };
}
