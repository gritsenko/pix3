import { type GameplayFullConfig } from './types';
import { TEXTURES } from '../../assets/textures';

export interface ItemConfig {
  sprite: string;
  value: number;
  scale: number;
}

export const DROPPABLE_ITEMS: Record<string, ItemConfig> = {
  gold: { sprite: TEXTURES.droppables.gold, value: 10, scale: 1 },
  stone: { sprite: TEXTURES.droppables.stone, value: 2, scale: 1 },
  iron: { sprite: TEXTURES.droppables.iron, value: 5, scale: 1 },
  diamond: { sprite: TEXTURES.droppables.diamond, value: 25, scale: 1 },
  gem: { sprite: TEXTURES.droppables.gem, value: 5, scale: 1 },
};

export const DROPPABLE_EMBEDDING_RULES: Record<number, { absorbChance: number; destroyAdrenalineFactor: number }> = {
  2: { absorbChance: 0.85, destroyAdrenalineFactor: 2.0 }, // DIRT
  3: { absorbChance: 0.25, destroyAdrenalineFactor: 3.5 }, // STONE
  4: { absorbChance: 0.2, destroyAdrenalineFactor: 4.0 },  // IRON_ORE
  5: { absorbChance: 0.2, destroyAdrenalineFactor: 4.0 },  // GOLD_ORE
  6: { absorbChance: 0.12, destroyAdrenalineFactor: 5.0 }, // DIAMOND_ORE
};

export const ADRENALINE_CONFIG = {
  threshold: 100,
  maxValue: 300,
};

export const gameplayConfig: GameplayFullConfig = {
  input: {
    swipeHorizontal: {
      threshold: 240,
      maxVerticalRatio: 0.75,
      minVelocity: 0.3,
      maxDuration: 400
    },

    swipeVertical: {
      enabled: true,
      threshold: 60,
      maxHorizontalRatio: 0.5,
      sensitivity: 0.01
    },

    trackpadSwipe: {
      enabled: true,
      threshold: 50,
      sensitivity: 1.0,
      resetTime: 30
    },

    gestureDetection: {
      decisionDistance: 20,
      decisionTime: 150
    },

    hold: {
      threshold: 200
    },

    tap: {
      maxDistance: 15,
      maxDuration: 200
    }
  },

  initialState: {
    gold: 0,
    gems: 0,
    depth: 0,
    maxDepth: 0,
    fuel: 100,
    maxFuel: 100,
    damageLevel: 0,
    toolDamageMultiplier: 1.0,
    hasBot: false,
    turboFuel: 100,
    maxTurboFuel: 100,
    turboActive: false,
    debugVisuals: false,
    debugMode: false,
    showFPS: false,
    currentTool: "pickaxe"
  },

  particles: {
    pool: {
      initialSize: 50,
      maxPoolSize: 200,
      expandAmount: 20
    },

    geometry: {
      boxSize: 0.15 // Increased from 0.1 for better mobile visibility
    },

    debris: { // for block destruction
      count: 12, // Increased from 8 for more visual impact
      gravity: -15,
      velocityRange: 10, // Increased from 6 for wider spread
      velocityYMin: 6, // Increased from 4
      velocityYMax: 12, // Increased from 8
      scaleMin: 0.3, // Reduced for 3D mesh particles
      scaleMax: 0.8, // Reduced for 3D mesh particles
      lifeMin: 0.5,
      lifeMax: 1.0
    },

    hit: { // for tool impacts
      count: 10, // Increased from 6 for more visual impact
      gravity: -15,
      velocityRange: 8, // Increased from 4 for wider spread
      velocityYMin: 4, // Increased from 2
      velocityYMax: 10, // Increased from 6
      scaleMin: 0.5, // Reduced for 3D mesh particles
      scaleMax: 1.5, // Reduced for 3D mesh particles
      lifeMin: 0.3,
      lifeMax: 0.6,
      brightness: 0.85 // Brightness factor for hit particles (0-1)
    },

    impactSparks: {
      maxPoolSize: 500,
      burstCount: 15,
      sparkColor: 0xffc61a,
      sparkRadius: 0.04,
      sparkLength: 0.8,
      life: 0.65,
      lifeDecay: 1.5,
      gravity: -6,
      speedMin: 10,
      speedMax: 25,
      drag: 0.92,
      spawnJitter: 0.08,
      scaleMin: 0.2,
      scaleMax: 1.0,
      renderOrder: 999,
      glowColor: 0xff8a00,
      glowOpacity: 0.3,
      glowSize: 1.0,
      glowFadeTime: 0.2,
      glowTextureSize: 64
    },

    explosionImpactSparks: {
      burstCount: 48,
      speedMinMultiplier: 1.2,
      speedMaxMultiplier: 1.5,
      scaleMinMultiplier: 1.1,
      scaleMaxMultiplier: 1.4,
      glowSizeMultiplier: 1.5,
      spawnJitterMultiplier: 1.75
    },

    sparkle: { // for tool effects
      countMin: 1,
      countMax: 2,
      velocity: 1,
      velocityY: 1,
      life: 0.8,
      lifeVariation: 0.4,
      gravity: -2
    },

    collect: { // for item collection
      count: 3,
      velocity: 3,
      velocityY: 4,
      life: 0.6
    },

    rotationSpeeds: {
      x: 10,
      y: 10
    }
  },

  feedback: {
    enableHPBars: false,
    enableDamageNumbers: false,
    damageNumbers: {
      normalSize: 24,
      critSize: 36,
      normalColor: "#ffffff",
      critColor: "#ffff00",
      duration: 1.5,
      floatSpeed: 80,
      // WebGL sprite rendering
      textureSize: { width: 128, height: 64 },
      maxCached: 50,
      maxActive: 30,
      poolInitialSize: 15,
      poolExpandAmount: 10,
      // Scale-pop animation
      scalePopDuration: 0.3,
      scalePopMax: 1.3,
      // Ballistic trajectory
      trajectorySpeed: { x: 2, y: 4 },
      trajectoryGravity: -9.8,
      // Rendering
      renderOrder: 90,
      spriteScale: 1.0,
      heightOffset: 1.0, // Starting height above block (2x higher than before)
      initialOpacity: 1.0 // Full brightness
    },

    hpBars: {
      width: 60,
      height: 8,
      borderRadius: 4,
      cornerRadius: 2,
      fillLerpSpeed: 10,
      fadeInDuration: 0.12,
      showDuration: 2.0,
      fadeOutDuration: 0.2,
      hideDuration: 0.5,
      thresholdHigh: 0.7,
      thresholdMedium: 0.3,
      colorHigh: "#00ff00",
      colorMedium: "#ffff00",
      colorLow: "#ff0000",
      // WebGL sprite rendering
      textureSize: { width: 128, height: 32 },
      maxActive: 15,
      poolInitialSize: 10,
      poolExpandAmount: 5,
      // Rendering
      renderOrder: 100,
      spriteScale: 0.8,
      offsetY: 1.4, // Offset above block center (2x higher)
      initialOpacity: 1.0 // Full brightness
    },

    sparkles: {
      count: 6,
      gravity: -5,
      velocityRange: 3,
      velocityYMin: 2,
      velocityYMax: 5,
      life: 0.7,
      lifeVariation: 0.3,
      scaleMin: 0.05,
      scaleMax: 0.15,
      rotationSpeedX: 5,
      rotationSpeedZ: 5,
      geometrySize: 1,
      defaultColor: 0xffffff
    }
  },

  turboMode: {
    fuelConsumptionRate: 10
  },

  debug: {
    airWireframeWindow: 50
  },

  depthRange: {
    maxDepthRange: 12
  },

  unstableBlocks: {
    initialBrightnessMultiplier: 0.5,
    maxBrightnessMultiplier: 1.0,
    hitsToExplode: 5,
    explodeOnlyFromToolHits: true,
    explodeOnZeroHpFromFalling: false,
    chainReactionDelayMs: 80,
    maxQueuedExplosionsPerFrame: 2
  },

  screenShake: {
    defaultAmplitude: 0.01,
    defaultDuration: 0.15
  },

  mining: {
    BASE_STAMINA_COST: 1,
    DEPTH_THRESHOLD: 3,
    HARDNESS_MULTIPLIER: 0.5,
    MIN_DAMAGE_PERCENT: 0.2,
    SWING_SPEED_PENALTY: 0.05,
    MISS_CHANCE_GROWTH: 0.05,
    MAX_MISS_CHANCE: 0.5
  }
};
