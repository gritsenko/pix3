import {
  normalizeAnimationResource,
  type AnimationResource,
} from '@pix3/runtime';

export function normalizeAnimationAssetPath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, '/');
  const withScheme = trimmed.startsWith('res://')
    ? trimmed
    : `res://${trimmed.replace(/^\/+/, '')}`;

  return withScheme.endsWith('.pix3anim') ? withScheme : `${withScheme}.pix3anim`;
}

export function createDefaultAnimationResource(
  texturePath: string,
  initialClipName = 'idle'
): AnimationResource {
  const normalizedTexturePath = texturePath.trim();

  return normalizeAnimationResource({
    version: '1.0.0',
    texturePath: normalizedTexturePath,
    clips: [
      {
        name: initialClipName,
        fps: 12,
        loop: true,
        frames: normalizedTexturePath
          ? [
              {
                textureIndex: 0,
                offset: { x: 0, y: 0 },
                repeat: { x: 1, y: 1 },
              },
            ]
          : [],
      },
    ],
  });
}

export function parseAnimationResourceText(source: string): AnimationResource {
  return normalizeAnimationResource(JSON.parse(source));
}

export function serializeAnimationResource(resource: AnimationResource): string {
  const normalized = normalizeAnimationResource(resource);
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

export function getAssetParentDirectory(resourcePath: string): string {
  const normalized = resourcePath.replace(/^res:\/\//, '').replace(/\\/g, '/');
  const lastSlashIndex = normalized.lastIndexOf('/');
  if (lastSlashIndex <= 0) {
    return '.';
  }

  return normalized.slice(0, lastSlashIndex);
}