import { describe, expect, it } from 'vitest';

import {
  buildAnimationFrameResourcePath,
  createDefaultAnimationResource,
  deriveAnimationAssetStem,
  getAnimationAssetDirectory,
  normalizeAnimationAssetPath,
} from './animation-asset-utils';

describe('animation asset utils', () => {
  it('normalizes folder-based animation asset paths', () => {
    expect(normalizeAnimationAssetPath('res://src/assets/animations/player')).toBe(
      'res://src/assets/animations/player/player.pix3anim'
    );
    expect(normalizeAnimationAssetPath('src/assets/animations/player')).toBe(
      'res://src/assets/animations/player/player.pix3anim'
    );
  });

  it('preserves explicit pix3anim paths and derives a stable stem', () => {
    const explicitPath = 'res://src/assets/animations/player/player.pix3anim';
    expect(normalizeAnimationAssetPath(explicitPath)).toBe(explicitPath);
    expect(deriveAnimationAssetStem(explicitPath)).toBe('player');
    expect(getAnimationAssetDirectory(explicitPath)).toBe('res://src/assets/animations/player');
    expect(buildAnimationFrameResourcePath(explicitPath, 12)).toBe(
      'res://src/assets/animations/player/frame_0012.png'
    );
  });

  it('creates sequence-first default resources', () => {
    const resource = createDefaultAnimationResource(
      'res://src/assets/animations/player/frame_0001.png',
      'idle'
    );

    expect(resource.texturePath).toBe('');
    expect(resource.clips[0]?.frames).toHaveLength(1);
    expect(resource.clips[0]?.frames[0]?.texturePath).toBe(
      'res://src/assets/animations/player/frame_0001.png'
    );
  });
});