import { EXPOSURE } from '../core/Types';

/**
 * Compute the visible brightness for a voxel based on its exposure distance
 */
export function getExposureBrightness(exposureDistance: number, isVisible: boolean): number {
  if (exposureDistance <= 0 && isVisible) return 1.0;

  const normalized = Math.max(0, Math.min(exposureDistance, EXPOSURE.maxDistance));
  if (!isVisible || normalized >= EXPOSURE.maxDistance) return EXPOSURE.minBrightness;

  if (normalized <= 1) {
    return Math.max(EXPOSURE.minBrightness, EXPOSURE.nearBrightness);
  }

  const range = Math.max(1, EXPOSURE.maxDistance - 1);
  const t = (normalized - 1) / range;
  return Math.max(
    EXPOSURE.minBrightness,
    EXPOSURE.minBrightness + (1 - t) * (EXPOSURE.nearBrightness - EXPOSURE.minBrightness)
  );
}
