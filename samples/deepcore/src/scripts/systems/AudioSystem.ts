import { ISystem } from '../core/ISystem';
import { AUDIO, AUDIO_CUES } from '../config';
import {
  getBreakCueForBlock,
  getHitCueForBlock,
  getRobotCueForState,
  type AudioCueId,
} from '../config/audio';
import {
  BlockDamagedEvent,
  BlockDestroyedEvent,
  BotStateChangedEvent,
  BotStateType,
  BlockType,
  LootCollectedEvent,
  ResourcesDroppedEvent,
} from '../core/Types';

type AudioContextCtor = typeof AudioContext;

interface CueRuntimeState {
  activeVoices: number;
  lastPlayedAt: number;
}

interface PlaybackOptions {
  gainMultiplier?: number;
  rateMultiplier?: number;
  pan?: number;
}

export class AudioSystem implements ISystem {
  private readonly buffers: Map<AudioCueId, AudioBuffer> = new Map();
  private readonly cueStates: Map<AudioCueId, CueRuntimeState> = new Map();
  private readonly activeSources: Set<AudioBufferSourceNode> = new Set();

  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private preloadPromise: Promise<void> | null = null;
  private enabled: boolean;
  private suspendedByGame: boolean = false;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  update(_deltaTime: number): void {
    // Event-driven one-shot audio does not require per-frame work.
  }

  async preload(): Promise<void> {
    if (this.preloadPromise) {
      return this.preloadPromise;
    }

    this.preloadPromise = this.loadPreloadedBuffers();
    return this.preloadPromise;
  }

  async unlock(): Promise<void> {
    const context = this.ensureAudioContext();
    if (!context || this.suspendedByGame || context.state === 'running') {
      return;
    }

    try {
      await context.resume();
    } catch {
      // Ignore unlock failures. The next user gesture can retry.
    }
  }

  async setPaused(paused: boolean): Promise<void> {
    this.suspendedByGame = paused;

    const context = this.audioContext;
    if (!context) {
      return;
    }

    try {
      if (paused && context.state === 'running') {
        await context.suspend();
      } else if (!paused && context.state === 'suspended' && this.enabled) {
        await context.resume();
      }
    } catch {
      // Ignore lifecycle errors. Audio can recover on the next interaction.
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;

    if (!enabled) {
      this.stopAll();
    }

    if (this.masterGainNode) {
      const now = this.masterGainNode.context.currentTime;
      this.masterGainNode.gain.cancelScheduledValues(now);
      this.masterGainNode.gain.setTargetAtTime(enabled ? AUDIO.masterGain : 0, now, 0.01);
    }
  }

  handleBlockDamaged(event: BlockDamagedEvent): void {
    if (event.damage <= 0 || event.remainingHp <= 0) {
      return;
    }

    const cueId = getHitCueForBlock(event.blockType);
    const gainMultiplier = event.blockType === BlockType.DIRT ? 0.9 : 1.0;
    const intensity = Math.min(1.35, 0.7 + event.damage / 12);
    this.playCue(cueId, {
      gainMultiplier: gainMultiplier * intensity,
      rateMultiplier: 0.98 + Math.min(0.08, event.damage * 0.005),
    });
  }

  handleBlockDestroyed(event: BlockDestroyedEvent): void {
    if (event.blockType === BlockType.UNSTABLE || event.source === 'explosion') {
      this.playCue('explosion', { gainMultiplier: 1.1 });
      return;
    }

    const cueId = getBreakCueForBlock(event.blockType);
    const quantityBoost = 1 + Math.min(0.35, event.droppedQuantity * 0.06);
    this.playCue(cueId, { gainMultiplier: quantityBoost });
  }

  handleResourcesDropped(event: ResourcesDroppedEvent): void {
    if (event.droppedQuantity <= 0) {
      return;
    }

    this.playCue('resourceDrop', {
      gainMultiplier: Math.min(1.25, 0.8 + event.droppedQuantity * 0.08),
      rateMultiplier: 1 + Math.min(0.05, event.droppedQuantity * 0.01),
    });
  }

  handleLootCollected(event: LootCollectedEvent): void {
    this.playCue('lootPickup', {
      gainMultiplier: Math.min(1.3, 0.9 + event.value / 30),
      rateMultiplier: event.itemType === 'gold' ? 1.04 : 1,
    });
  }

  handleClusterLanded(blockCount: number): void {
    if (blockCount <= 0) {
      return;
    }

    this.playCue('clusterImpact', {
      gainMultiplier: Math.min(1.4, 0.75 + blockCount * 0.04),
      rateMultiplier: Math.max(0.92, 1 - blockCount * 0.003),
    });
  }

  handleBotStateChanged(event: BotStateChangedEvent): void {
    if (Math.random() > 0.05) {
      return;
    }

    const cueId = getRobotCueForState(event.nextState as BotStateType);
    if (!cueId) {
      return;
    }

    const gainMultiplier = event.nextState === BotStateType.ERROR ? 0.95 : 1;
    this.playCue(cueId, { gainMultiplier });
  }

  dispose(): void {
    this.stopAll();

    if (this.audioContext) {
      void this.audioContext.close().catch(() => {
        // Ignore teardown failures.
      });
    }

    this.audioContext = null;
    this.masterGainNode = null;
    this.buffers.clear();
    this.cueStates.clear();
  }

  private async loadPreloadedBuffers(): Promise<void> {
    const cueIds = (Object.entries(AUDIO_CUES) as Array<[AudioCueId, (typeof AUDIO_CUES)[AudioCueId]]>)
      .filter(([, config]) => config.preload !== false)
      .map(([cueId]) => cueId);

    const timeoutPromise = new Promise<void>((resolve) => {
      window.setTimeout(resolve, AUDIO.preloadTimeoutMs);
    });

    const loadPromise = Promise.allSettled(cueIds.map((cueId) => this.loadBuffer(cueId))).then(() => undefined);
    await Promise.race([loadPromise, timeoutPromise]);
  }

  private async loadBuffer(cueId: AudioCueId): Promise<AudioBuffer | null> {
    const existing = this.buffers.get(cueId);
    if (existing) {
      return existing;
    }

    const context = this.ensureAudioContext();
    if (!context) {
      return null;
    }

    try {
      const response = await fetch(AUDIO_CUES[cueId].path);
      if (!response.ok) {
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
      this.buffers.set(cueId, audioBuffer);
      return audioBuffer;
    } catch {
      return null;
    }
  }

  private ensureAudioContext(): AudioContext | null {
    if (this.audioContext && this.masterGainNode) {
      return this.audioContext;
    }

    const contextCtor = this.getAudioContextCtor();
    if (!contextCtor) {
      return null;
    }

    if (!this.audioContext) {
      this.audioContext = new contextCtor();
    }

    if (!this.masterGainNode) {
      this.masterGainNode = this.audioContext.createGain();
      this.masterGainNode.gain.value = this.enabled ? AUDIO.masterGain : 0;
      this.masterGainNode.connect(this.audioContext.destination);
    }

    return this.audioContext;
  }

  private getAudioContextCtor(): AudioContextCtor | null {
    const audioWindow = window as Window & typeof globalThis & { webkitAudioContext?: AudioContextCtor };
    return audioWindow.AudioContext || audioWindow.webkitAudioContext || null;
  }

  private playCue(cueId: AudioCueId, options: PlaybackOptions = {}): void {
    if (!this.enabled || this.suspendedByGame) {
      return;
    }

    const context = this.ensureAudioContext();
    const masterGainNode = this.masterGainNode;
    if (!context || !masterGainNode || context.state !== 'running') {
      return;
    }

    const config = AUDIO_CUES[cueId];
    const state = this.getCueState(cueId);
    const now = performance.now();

    if (now - state.lastPlayedAt < config.cooldownMs) {
      return;
    }

    if (state.activeVoices >= config.maxVoices || this.activeSources.size >= AUDIO.maxGlobalVoices) {
      return;
    }

    const buffer = this.buffers.get(cueId);
    if (!buffer) {
      void this.loadBuffer(cueId);
      return;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;

    const gainNode = context.createGain();
    gainNode.gain.value = config.gain * (options.gainMultiplier ?? 1);

    const playbackRate = this.randomBetween(config.rateMin, config.rateMax) * (options.rateMultiplier ?? 1);
    source.playbackRate.value = playbackRate;

    let outputNode: AudioNode = gainNode;
    const panAmount = options.pan ?? this.randomBetween(-config.stereoSpread, config.stereoSpread);
    if (typeof context.createStereoPanner === 'function') {
      const panner = context.createStereoPanner();
      panner.pan.value = panAmount;
      gainNode.connect(panner);
      outputNode = panner;
    }

    outputNode.connect(masterGainNode);
    source.connect(gainNode);

    state.lastPlayedAt = now;
    state.activeVoices += 1;
    this.activeSources.add(source);

    source.addEventListener('ended', () => {
      state.activeVoices = Math.max(0, state.activeVoices - 1);
      this.activeSources.delete(source);
      source.disconnect();
      gainNode.disconnect();
      if (outputNode !== gainNode) {
        outputNode.disconnect();
      }
    }, { once: true });

    source.start();
  }

  private getCueState(cueId: AudioCueId): CueRuntimeState {
    const existing = this.cueStates.get(cueId);
    if (existing) {
      return existing;
    }

    const created: CueRuntimeState = { activeVoices: 0, lastPlayedAt: -Infinity };
    this.cueStates.set(cueId, created);
    return created;
  }

  private randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private stopAll(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // Ignore stop races when sources have already ended.
      }
    }

    this.activeSources.clear();
    for (const state of this.cueStates.values()) {
      state.activeVoices = 0;
    }
  }
}