import { PhysicsFullConfig } from './types';

export const physicsConfig: PhysicsFullConfig = {
  physics: {
    gravity: -20,
    minImpactVelocity: 2
  },

  grid: {
    width: 4,
    depth: 4,
    initialHeight: 20,
    chunkSize: 20,
    chunkHeight: 6,
    minX: -1.5,
    maxX: 1.5,
    minZ: -1.5,
    maxZ: 1.5,
    floatingOriginReset: 500
  },

  instancedMesh: {
    maxInstancesPerType: 2000
  },

  fallingBlocks: {
    settleCheckInterval: 0.5,
    settleVelocityThreshold: 0.1,
    removeAfterSettle: 1.0
  },

  clusterFalling: {
    fallSpeed: 5,
    bounceDuration: 0.6,
    bounceHeight: 0.1,
    bounceEasing: 'bounce.out',
    impactDamageMultiplier: 15
  },

  stability: {
    checkInterval: 0.1,
    wobblePerDamage: 0.5,
    wobbleDecayRate: 0.5,
    shockwaveReach: 1,
    shockwaveDecay: 0.5,
    shockwaveIncludeTop: true,
    shockwaveIncludeBottom: true,
    stabilityThreshold: 0,
  }
};
