import * as THREE from 'three';
import {
  BLOCK_TYPES,
  BLOCK_PROPERTIES,
  STABILITY_CONFIG,
  TOOL_PROPERTIES,
} from '../config/index';

// Block Types
export enum BlockType {
  AIR = BLOCK_TYPES.AIR,
  BEDROCK = BLOCK_TYPES.BEDROCK,
  DIRT = BLOCK_TYPES.DIRT,
  STONE = BLOCK_TYPES.STONE,
  IRON_ORE = BLOCK_TYPES.IRON_ORE,
  SILVER_ORE = BLOCK_TYPES.SILVER_ORE,
  GOLD_ORE = BLOCK_TYPES.GOLD_ORE,
  DIAMOND_ORE = BLOCK_TYPES.DIAMOND_ORE,
  UNSTABLE = BLOCK_TYPES.UNSTABLE,
}

export interface BlockProperties {
  hp: number;
  density: number;
  hardness: number;
  adhesion: boolean;
  color: number;
  gripForce: number;
  fragility: number;
  impactForce: number;
  energyAbsorption: number;
  mass: number;
  modelPath?: string;
  scale?: number;
  randomRotation?: boolean;
  explosionRadius?: number;
  explosionDamage?: number;
}

export { BLOCK_PROPERTIES, STABILITY_CONFIG, TOOL_PROPERTIES };

export enum ToolType {
  PICKAXE = 'pickaxe',
  SHOVEL = 'shovel',
  DRILL = 'drill',
}

export interface ToolProperties {
  baseDamage: number;
  stoneMultiplier: number;
  dirtMultiplier: number;
  inputMode: 'tap' | 'hold';
  tickRate?: number;
  fuelCost: number;
  multiTouchAllowed: boolean;
}

export type ToolPropertyData = ToolProperties & {
  impactType?: 'damage' | 'stability';
  impactRadius?: number;
};

// Bot-related types
export interface BotConfig {
  navigation: {
    speed: number;
    sphereRadius: number;
    stuckDetectionTime: number;
    recoveryTime: number;
    scanRange: number;
    raycastDistance: number;
    surfaceOffset: number;
    maxErrorCount: number;
    pathRetryCooldown: number;
    maxPathRetries: number;
    unreachableTargetCooldown: number;
  };
  collection: {
    collectionRange: number;
    searchInterval: number;
    collectInterval: number;
  };
  visual: {
    modelPath: string;
    scale: number;
    color: number;
    errorColor: number;
    recoveryColor: number;
  };
  debug: {
    showCollider: boolean;
    showPath: boolean;
    showTarget: boolean;
    logStateChanges: boolean;
    logCollection: boolean;
    logErrors: boolean;
    logNavigation: boolean;
  };
}

export interface BotState {
  position: THREE.Vector3;
  target?: { x: number; y: number; z: number; blockType: BlockType };
  itemTarget?: THREE.Object3D; // Reference to target item's hitMesh or sprite
  surfaceNormal: THREE.Vector3; // For orientation (up vector)
  state: BotStateType;
  stuckTimer: number;
  recoveryTimer: number;
  errorCount: number;
  lastHarvestTime: number;
  lastSearchTime: number;
  fallingTimer: number; // For bounce logic
  isLanding: boolean; // Flag for landing animation
}

export enum BotStateType {
  IDLE = 'idle',
  SEARCHING = 'searching',
  COLLECTING = 'collecting',
  FALLING = 'falling',
  ERROR = 'error',
  RECOVERING = 'recovering'
}

export interface BotEntity {
  id: string;
  state: BotState;
  collider: THREE.Object3D;
  visual: THREE.Object3D;
  physicsBody?: any; // Will be set by PhysicsWorld
  isStuck: boolean;
  isFalling: boolean;
  isBeingDragged: boolean;
}
