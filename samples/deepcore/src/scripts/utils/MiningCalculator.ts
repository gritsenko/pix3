import { type MiningConfig } from '../config/types';

export interface MiningStats {
  damageMultiplier: number;
  speedMultiplier: number;
  missChance: number;
}

/**
 * Calculates mining penalties based on depth delta relative to Average Surface Depth (ASD).
 * 
 * Formula:
 * depthDelta = blockDepth - averageSurfaceDepth
 * If depthDelta > DEPTH_THRESHOLD:
 *   penaltyFactor = depthDelta - DEPTH_THRESHOLD
 *   damagePenalty = 1 / (1 + penaltyFactor * HARDNESS_MULTIPLIER)
 *   speedPenalty = 1 / (1 + penaltyFactor * SWING_SPEED_PENALTY)
 * 
 * The penalty scales non-linearly to provide increasing difficulty as the player
 * digs deeper than the surrounding surface area, encouraging wider excavation.
 */
export function calculateMiningStats(
  blockDepth: number,
  averageSurfaceDepth: number,
  config: MiningConfig
): MiningStats {
  const depthDelta = blockDepth - averageSurfaceDepth;

  // No penalty if within safe threshold
  if (depthDelta <= config.DEPTH_THRESHOLD) {
    return {
      damageMultiplier: 1.0,
      speedMultiplier: 1.0,
      missChance: 0.0
    };
  }

  const penaltyFactor = depthDelta - config.DEPTH_THRESHOLD;

  // Calculate damage multiplier (clamped to MIN_DAMAGE_PERCENT)
  // We use inverse scaling 1 / (1 + k*x) for a smooth non-linear feel
  let damageMultiplier = 1.0 / (1.0 + penaltyFactor * config.HARDNESS_MULTIPLIER);
  damageMultiplier = Math.max(damageMultiplier, config.MIN_DAMAGE_PERCENT);

  // Calculate speed multiplier (penalty scales animation/cooldown speed)
  const speedMultiplier = 1.0 / (1.0 + penaltyFactor * config.SWING_SPEED_PENALTY);

  // Calculate miss chance (grows linearly with depthDelta then clamps)
  const missChance = Math.min(penaltyFactor * config.MISS_CHANCE_GROWTH, config.MAX_MISS_CHANCE);

  return {
    damageMultiplier,
    speedMultiplier,
    missChance
  };
}
