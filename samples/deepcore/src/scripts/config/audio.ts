import { blocksConfig } from './blocks';

const { DIRT } = blocksConfig.blockTypes;

export type AudioCueId =
  | 'hitStone'
  | 'hitDirt'
  | 'breakStone'
  | 'breakDirt'
  | 'resourceDrop'
  | 'lootPickup'
  | 'explosion'
  | 'clusterImpact'
  | 'robotSearch'
  | 'robotCollect'
  | 'robotError'
  | 'robotRecover';

export interface AudioCueConfig {
  path: string;
  gain: number;
  cooldownMs: number;
  maxVoices: number;
  rateMin: number;
  rateMax: number;
  stereoSpread: number;
  preload?: boolean;
}

export interface AudioRuntimeConfig {
  enabledByDefault: boolean;
  masterGain: number;
  maxGlobalVoices: number;
  preloadTimeoutMs: number;
}

export const audioConfig: AudioRuntimeConfig = {
  enabledByDefault: true,
  masterGain: 0.58,
  maxGlobalVoices: 12,
  preloadTimeoutMs: 5000,
};

const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export const audioCueConfig: Record<AudioCueId, AudioCueConfig> = {
  hitStone: {
    path: `${base}/sounds/axe.mp3`,
    gain: 0.36,
    cooldownMs: 65,
    maxVoices: 3,
    rateMin: 0.95,
    rateMax: 1.05,
    stereoSpread: 0.12,
    preload: true,
  },
  hitDirt: {
    path: `${base}/sounds/axe_dirt.mp3`,
    gain: 0.34,
    cooldownMs: 50,
    maxVoices: 3,
    rateMin: 0.94,
    rateMax: 1.06,
    stereoSpread: 0.14,
    preload: true,
  },
  breakStone: {
    path: `${base}/sounds/stone_break.mp3`,
    gain: 0.42,
    cooldownMs: 90,
    maxVoices: 2,
    rateMin: 0.97,
    rateMax: 1.03,
    stereoSpread: 0.18,
    preload: true,
  },
  breakDirt: {
    path: `${base}/sounds/dirt_break.mp3`,
    gain: 0.4,
    cooldownMs: 90,
    maxVoices: 2,
    rateMin: 0.96,
    rateMax: 1.04,
    stereoSpread: 0.18,
    preload: true,
  },
  resourceDrop: {
    path: `${base}/sounds/drop.mp3`,
    gain: 0.3,
    cooldownMs: 70,
    maxVoices: 2,
    rateMin: 0.96,
    rateMax: 1.08,
    stereoSpread: 0.2,
    preload: true,
  },
  lootPickup: {
    path: `${base}/sounds/pickup_gold_01.mp3`,
    gain: 0.4,
    cooldownMs: 45,
    maxVoices: 3,
    rateMin: 0.98,
    rateMax: 1.08,
    stereoSpread: 0.22,
    preload: true,
  },
  explosion: {
    path: `${base}/sounds/explosion1.mp3`,
    gain: 0.5,
    cooldownMs: 220,
    maxVoices: 2,
    rateMin: 0.94,
    rateMax: 1.02,
    stereoSpread: 0.08,
    preload: true,
  },
  clusterImpact: {
    path: `${base}/sounds/explosion2.mp3`,
    gain: 0.38,
    cooldownMs: 180,
    maxVoices: 2,
    rateMin: 0.98,
    rateMax: 1.02,
    stereoSpread: 0.1,
    preload: true,
  },
  robotSearch: {
    path: `${base}/sounds/robot_talk_01.mp3`,
    gain: 0.28,
    cooldownMs: 250,
    maxVoices: 1,
    rateMin: 0.98,
    rateMax: 1.05,
    stereoSpread: 0.2,
    preload: true,
  },
  robotCollect: {
    path: `${base}/sounds/robot_talk_02.mp3`,
    gain: 0.32,
    cooldownMs: 250,
    maxVoices: 1,
    rateMin: 0.98,
    rateMax: 1.05,
    stereoSpread: 0.2,
    preload: true,
  },
  robotError: {
    path: `${base}/sounds/robot_talk_02.mp3`,
    gain: 0.24,
    cooldownMs: 400,
    maxVoices: 1,
    rateMin: 0.86,
    rateMax: 0.94,
    stereoSpread: 0.14,
    preload: true,
  },
  robotRecover: {
    path: `${base}/sounds/robot_talk_01.mp3`,
    gain: 0.24,
    cooldownMs: 400,
    maxVoices: 1,
    rateMin: 1.04,
    rateMax: 1.1,
    stereoSpread: 0.14,
    preload: true,
  },
};

export function getHitCueForBlock(blockType: number): AudioCueId {
  return blockType === DIRT ? 'hitDirt' : 'hitStone';
}

export function getBreakCueForBlock(blockType: number): AudioCueId {
  return blockType === DIRT ? 'breakDirt' : 'breakStone';
}

export function getRobotCueForState(state: string): AudioCueId | null {
  switch (state) {
    case 'searching':
      return 'robotSearch';
    case 'collecting':
      return 'robotCollect';
    case 'error':
      return 'robotError';
    case 'recovering':
      return 'robotRecover';
    default:
      return null;
  }
}
