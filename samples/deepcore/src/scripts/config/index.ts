import { blocksConfig } from './blocks';
import { toolsConfig } from './tools';
import { physicsConfig } from './physics';
import { renderingConfig, exposureConfig } from './rendering';
import { gameplayConfig, DROPPABLE_ITEMS } from './gameplay';
import { audioConfig, audioCueConfig } from './audio';

import type {
  BlocksConfig,
  ToolsConfig,
  PhysicsFullConfig,
  RenderingFullConfig,
  GameplayFullConfig,
  BlockTypes,
  ToolTypes,
  BlockPropertyData,
  ToolPropertyData,
  ExposureConfig,
  DamageMaskConfig,
  DepthMarkersConfig,
} from './types';

// Block property conversion for runtime format
function convertBlockProperty(data: BlockPropertyData) {
  return {
    hp: data.hp,
    density: data.density,
    hardness: data.hardness,
    adhesion: data.adhesion,
    color: data.color,
    gripForce: data.gripForce,
    fragility: data.fragility,
    impactForce: data.impactForce,
    energyAbsorption: data.energyAbsorption,
    mass: data.mass,
    modelPath: data.modelPath,
    scale: data.scale,
    randomRotation: data.randomRotation,
    explosionRadius: data.explosionRadius,
    explosionDamage: data.explosionDamage,
  };
}

// Block configuration
export const BLOCK_TYPES = blocksConfig.blockTypes;

export const BLOCK_PROPERTIES: Record<number, ReturnType<typeof convertBlockProperty>> = {};
for (const [key, value] of Object.entries(blocksConfig.blockProperties)) {
  BLOCK_PROPERTIES[parseInt(key)] = convertBlockProperty(value);
}

// Tool configuration
export const TOOL_TYPES = toolsConfig.toolTypes;

export const TOOL_PROPERTIES: Record<string, ToolPropertyData> = toolsConfig.toolProperties as Record<string, ToolPropertyData>;

export const UPGRADES = toolsConfig.upgrades;

// Physics and grid configuration
export const PHYSICS = physicsConfig.physics;

export const GRID = physicsConfig.grid;

export const INSTANCED_MESH = physicsConfig.instancedMesh;

export const FALLING_BLOCKS = physicsConfig.fallingBlocks;

export const STABILITY = physicsConfig.stability;
export { STABILITY as STABILITY_CONFIG };

// Rendering configuration
export const CAMERA = renderingConfig.camera;

export const RENDERER = renderingConfig.renderer;

export const LIGHTING = renderingConfig.lighting;

export const BLOCK_RENDERING = renderingConfig.blockRendering;

export const WALL_PLANES = renderingConfig.wallPlanes;

export const DEPTH_MARKERS = renderingConfig.depthMarkers;

// Gameplay and logic configuration
export const INPUT = gameplayConfig.input;

export const INITIAL_STATE = gameplayConfig.initialState;

export const PARTICLES = gameplayConfig.particles;

export const FEEDBACK = gameplayConfig.feedback;

export const TURBO_MODE = gameplayConfig.turboMode;

export const UNSTABLE_BLOCKS = gameplayConfig.unstableBlocks;

export { DROPPABLE_ITEMS };

export const DEBUG = gameplayConfig.debug;

export const DEPTH_RANGE = gameplayConfig.depthRange;

// Gameplay configuration
export const GAMEPLAY_CONFIG = gameplayConfig;

export const AUDIO = audioConfig;

export const AUDIO_CUES = audioCueConfig;

// Exposure configuration
export const EXPOSURE = exposureConfig;

// Re-export types
export type {
  BlocksConfig,
  ToolsConfig,
  PhysicsFullConfig,
  RenderingFullConfig,
  GameplayFullConfig,
  BlockTypes,
  ToolTypes,
  BlockPropertyData,
  ToolPropertyData,
  ExposureConfig,
  DamageMaskConfig,
  DepthMarkersConfig,
};
