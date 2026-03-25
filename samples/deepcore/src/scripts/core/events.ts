import * as THREE from 'three';
import { BlockType } from './entities';

export type DamageSource = 'tool' | 'explosion' | 'fallImpact' | 'clusterImpact' | 'system';

export const GameEvents = {
  BLOCK_DESTROYED: 'game:block:destroyed',
  BLOCK_DAMAGED: 'game:block:damaged',
  RESOURCES_DROPPED: 'game:resources:dropped',
  STABILITY_CHECK: 'game:stability:check',
  BLOCK_FALLING: 'game:block:falling',
  BLOCK_PLACED: 'game:block:placed',
  BLOCK_IMPACT: 'game:block:impact',
  BLOCK_CLUSTER_CREATED: 'game:block:cluster_created',
  CLUSTER_LANDED: 'game:cluster:landed',
  TOOL_CHANGED: 'game:tool:changed',
  TURBO_ACTIVATED: 'game:turbo:activated',
  TURBO_DEACTIVATED: 'game:turbo:deactivated',
  DEPTH_CHANGED: 'game:depth:changed',
  CAMERA_ROTATED: 'game:camera:rotated',
  CAMERA_SHAKE: 'game:camera:shake',
  LOOT_COLLECTED: 'game:loot:collected',
  BOT_STATE_CHANGED: 'game:bot:state_changed',
} as const;

export type GameEventType = typeof GameEvents[keyof typeof GameEvents];

export interface BlockDestroyedEvent {
  x: number;
  y: number;
  z: number;
  blockType: BlockType;
  droppedQuantity: number;
  droppableItems?: Map<string, number>;
  source: DamageSource;
  hitPoint?: THREE.Vector3;
}

export interface BlockDamagedEvent {
  x: number;
  y: number;
  z: number;
  damage: number;
  previousHp: number;
  remainingHp: number;
  blockType: BlockType;
  source: DamageSource;
  hitPoint?: THREE.Vector3;
}

export interface ResourcesDroppedEvent {
  x: number;
  y: number;
  z: number;
  blockType: BlockType;
  droppedQuantity: number;
}

export interface LootCollectedEvent {
  itemType: string;
  value: number;
}

export interface BotStateChangedEvent {
  previousState: string;
  nextState: string;
}

export interface ResourceSettledEvent {
  x: number;
  y: number;
  z: number;
  resourceType: string;
}

export interface BlockFallingEvent {
  x: number;
  y: number;
  z: number;
  blockType: BlockType;
}

export interface BlockPlacedEvent {
  x: number;
  y: number;
  z: number;
  blockType: BlockType;
}

export interface BlockImpactEvent {
  fallingBlock: { x: number; y: number; z: number };
  targetBlock: { x: number; y: number; z: number };
  damage: number;
  velocity: number;
}

export interface ClusterBlock {
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
  rotXIndex?: number;
  rotYIndex?: number;
  rotZIndex?: number;
  soilBreakthroughUsed?: boolean;
  unstableHitCount?: number;
  unstableHeat?: number;
}

export interface Cluster {
  id: string;
  blocks: ClusterBlock[];
  position: THREE.Vector3;
  velocity: number;
  isLanding: boolean;
  totalMass: number;
  kineticEnergy: number;
  startY: number;
  fallDistance: number;
}

export function emitGameEvent<T>(eventType: GameEventType, detail: T): void {
  window.dispatchEvent(new CustomEvent(eventType, { detail }));
}

export function onGameEvent<T>(
  eventType: GameEventType,
  handler: (detail: T) => void
): () => void {
  const listener = (event: Event) => {
    handler((event as CustomEvent<T>).detail);
  };
  window.addEventListener(eventType, listener);
  return () => window.removeEventListener(eventType, listener);
}
