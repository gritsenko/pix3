import { normalizeAnimationResource, type AnimationResource } from '@pix3/runtime';

export function normalizeAnimationAssetPath(path: string): string {
  const trimmed = path.trim().replace(/\\/g, '/');
  const withScheme = trimmed.startsWith('res://')
    ? trimmed
    : `res://${trimmed.replace(/^\/+/, '')}`;

  return withScheme.endsWith('.pix3anim') ? withScheme : `${withScheme}.pix3anim`;
}

export function deriveAnimationDocumentId(resourcePath: string): string {
  const normalizedPath = normalizeAnimationAssetPath(resourcePath)
    .replace(/^res:\/\//i, '')
    .replace(/^templ:\/\//i, '')
    .replace(/^collab:\/\//i, '')
    .replace(/\.[^./]+$/i, '');

  const normalizedId = normalizedPath
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  return normalizedId || 'animation';
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
        playbackMode: 'normal',
        frames: normalizedTexturePath
          ? [
              {
                textureIndex: 0,
                offset: { x: 0, y: 0 },
                repeat: { x: 1, y: 1 },
                durationMultiplier: 1,
                anchor: { x: 0.5, y: 1 },
                texturePath: '',
                boundingBox: { x: 0, y: 0, width: 0, height: 0 },
                collisionPolygon: [],
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
