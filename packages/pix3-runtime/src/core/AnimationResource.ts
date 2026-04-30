export interface AnimationVector2 {
  x: number;
  y: number;
}

export interface AnimationBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnimationPolygonPoint {
  x: number;
  y: number;
}

export type AnimationPlaybackMode = 'normal' | 'ping-pong';

export interface AnimationFrame {
  textureIndex: number;
  offset: AnimationVector2;
  repeat: AnimationVector2;
  durationMultiplier: number;
  anchor: AnimationVector2;
  texturePath: string;
  boundingBox: AnimationBoundingBox;
  collisionPolygon: AnimationPolygonPoint[];
}

export interface AnimationClip {
  name: string;
  frames: AnimationFrame[];
  fps: number;
  loop: boolean;
  playbackMode: AnimationPlaybackMode;
}

export interface AnimationResource {
  version: string;
  texturePath: string;
  clips: AnimationClip[];
}

export function getAnimationFrameTexturePath(
  resource: AnimationResource | null | undefined,
  frame: AnimationFrame | null | undefined
): string {
  if (!frame) {
    return '';
  }

  if (frame.texturePath.trim().length > 0) {
    return frame.texturePath.trim();
  }

  return resource?.texturePath?.trim() ?? '';
}

export function isSequenceAnimationFrame(frame: AnimationFrame | null | undefined): boolean {
  return Boolean(frame?.texturePath?.trim());
}

function normalizeVector2(value: unknown): AnimationVector2 {
  const candidate = typeof value === 'object' && value !== null ? value : {};
  const x = typeof (candidate as { x?: unknown }).x === 'number' ? (candidate as { x: number }).x : 0;
  const y = typeof (candidate as { y?: unknown }).y === 'number' ? (candidate as { y: number }).y : 0;
  return { x, y };
}

function normalizeFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeBoundingBox(value: unknown): AnimationBoundingBox {
  const candidate = typeof value === 'object' && value !== null ? value : {};
  return {
    x: normalizeFiniteNumber((candidate as { x?: unknown }).x),
    y: normalizeFiniteNumber((candidate as { y?: unknown }).y),
    width: Math.max(0, normalizeFiniteNumber((candidate as { width?: unknown }).width)),
    height: Math.max(0, normalizeFiniteNumber((candidate as { height?: unknown }).height)),
  };
}

function normalizePolygonPoint(value: unknown): AnimationPolygonPoint {
  return normalizeVector2(value);
}

function normalizePlaybackMode(value: unknown): AnimationPlaybackMode {
  return value === 'ping-pong' ? 'ping-pong' : 'normal';
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
    durationMultiplier: Math.max(
      0.001,
      normalizeFiniteNumber((candidate as { durationMultiplier?: unknown }).durationMultiplier, 1)
    ),
    anchor: normalizeVector2((candidate as { anchor?: unknown }).anchor),
    texturePath:
      typeof (candidate as { texturePath?: unknown }).texturePath === 'string'
        ? (candidate as { texturePath: string }).texturePath.trim()
        : '',
    boundingBox: normalizeBoundingBox((candidate as { boundingBox?: unknown }).boundingBox),
    collisionPolygon: Array.isArray((candidate as { collisionPolygon?: unknown }).collisionPolygon)
      ? ((candidate as { collisionPolygon: unknown[] }).collisionPolygon ?? []).map(
          normalizePolygonPoint
        )
      : [],
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
    playbackMode: normalizePlaybackMode((candidate as { playbackMode?: unknown }).playbackMode),
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