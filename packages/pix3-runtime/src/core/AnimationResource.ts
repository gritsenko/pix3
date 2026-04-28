export interface AnimationVector2 {
  x: number;
  y: number;
}

export interface AnimationFrame {
  textureIndex: number;
  offset: AnimationVector2;
  repeat: AnimationVector2;
}

export interface AnimationClip {
  name: string;
  frames: AnimationFrame[];
  fps: number;
  loop: boolean;
}

export interface AnimationResource {
  version: string;
  texturePath: string;
  clips: AnimationClip[];
}

function normalizeVector2(value: unknown): AnimationVector2 {
  const candidate = typeof value === 'object' && value !== null ? value : {};
  const x = typeof (candidate as { x?: unknown }).x === 'number' ? (candidate as { x: number }).x : 0;
  const y = typeof (candidate as { y?: unknown }).y === 'number' ? (candidate as { y: number }).y : 0;
  return { x, y };
}

function normalizeFrame(frame: unknown): AnimationFrame {
  const candidate = typeof frame === 'object' && frame !== null ? frame : {};
  const textureIndex =
    typeof (candidate as { textureIndex?: unknown }).textureIndex === 'number'
      ? Math.max(0, Math.floor((candidate as { textureIndex: number }).textureIndex))
      : 0;

  return {
    textureIndex,
    offset: normalizeVector2((candidate as { offset?: unknown }).offset),
    repeat: normalizeVector2((candidate as { repeat?: unknown }).repeat),
  };
}

function normalizeClip(clip: unknown, index: number): AnimationClip {
  const candidate = typeof clip === 'object' && clip !== null ? clip : {};
  const rawFrames = Array.isArray((candidate as { frames?: unknown }).frames)
    ? ((candidate as { frames: unknown[] }).frames ?? [])
    : [];

  return {
    name:
      typeof (candidate as { name?: unknown }).name === 'string' &&
      (candidate as { name: string }).name.trim().length > 0
        ? (candidate as { name: string }).name.trim()
        : `clip-${index + 1}`,
    frames: rawFrames.map(normalizeFrame),
    fps:
      typeof (candidate as { fps?: unknown }).fps === 'number' &&
      Number.isFinite((candidate as { fps: number }).fps) &&
      (candidate as { fps: number }).fps > 0
        ? (candidate as { fps: number }).fps
        : 12,
    loop:
      typeof (candidate as { loop?: unknown }).loop === 'boolean'
        ? (candidate as { loop: boolean }).loop
        : true,
  };
}

export function normalizeAnimationResource(resource: unknown): AnimationResource {
  const candidate = typeof resource === 'object' && resource !== null ? resource : {};
  const rawClips = Array.isArray((candidate as { clips?: unknown }).clips)
    ? ((candidate as { clips: unknown[] }).clips ?? [])
    : [];

  return {
    version:
      typeof (candidate as { version?: unknown }).version === 'string' &&
      (candidate as { version: string }).version.trim().length > 0
        ? (candidate as { version: string }).version.trim()
        : '1.0.0',
    texturePath:
      typeof (candidate as { texturePath?: unknown }).texturePath === 'string'
        ? (candidate as { texturePath: string }).texturePath.trim()
        : '',
    clips: rawClips.map(normalizeClip),
  };
}

export function findAnimationClip(
  resource: AnimationResource | null | undefined,
  clipName: string | null | undefined
): AnimationClip | null {
  if (!resource || resource.clips.length === 0) {
    return null;
  }

  if (!clipName) {
    return resource.clips[0] ?? null;
  }

  return resource.clips.find(clip => clip.name === clipName) ?? resource.clips[0] ?? null;
}