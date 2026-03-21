export interface AudioPlayback {
  stop: () => void;
}

export interface PlayAudioOptions {
  volume?: number;
  loop?: boolean;
}

type WebkitAudioContextCtor = new () => AudioContext;

interface WindowWithWebkitAudioContext extends Window {
  webkitAudioContext?: WebkitAudioContextCtor;
}

export class AudioService {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private readonly activePlaybacks = new Set<AudioPlayback>();
  private suspendedByFocusLoss = false;
  private readonly unlockFromPointerDown = (): void => {
    this.unlock();
  };
  private readonly unlockFromKeydown = (): void => {
    this.unlock();
  };

  constructor() {
    const audioWindow = window as WindowWithWebkitAudioContext;
    const AudioContextCtor: typeof AudioContext | WebkitAudioContextCtor | undefined =
      window.AudioContext ?? audioWindow.webkitAudioContext;

    if (!AudioContextCtor) {
      console.warn('[AudioService] Web Audio API is not supported in this environment.');
      return;
    }

    try {
      this.context = new AudioContextCtor();
      this.masterGain = this.context.createGain();
      this.masterGain.connect(this.context.destination);
    } catch (error) {
      this.context = null;
      this.masterGain = null;
      console.warn('[AudioService] Failed to initialize AudioContext:', error);
      return;
    }

    // iOS Safari / Web Audio requirement: context must be resumed by user interaction
    window.addEventListener('pointerdown', this.unlockFromPointerDown, { once: true });
    window.addEventListener('keydown', this.unlockFromKeydown, { once: true });

    // Auto-mute on focus loss
    window.addEventListener('blur', this.handleActivityChange);
    window.addEventListener('focus', this.handleActivityChange);
    window.addEventListener('pageshow', this.handleActivityChange);
    window.addEventListener('pagehide', this.handleActivityChange);
    document.addEventListener('visibilitychange', this.handleActivityChange);
    this.handleActivityChange();
  }

  setVolume(value: number): void {
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(value, this.context?.currentTime ?? 0, 0.01);
    }
  }

  mute(): void {
    this.setVolume(0);
  }

  unmute(): void {
    this.setVolume(1);
  }

  private handleActivityChange = (): void => {
    const isVisible = document.visibilityState === 'visible';
    const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
    const isActive = isVisible && hasFocus;

    if (!isActive) {
      if (this.context?.state === 'running') {
        this.suspendedByFocusLoss = true;
        void this.context.suspend();
      }
      return;
    }

    if (this.suspendedByFocusLoss && this.context?.state === 'suspended') {
      this.suspendedByFocusLoss = false;
      void this.context.resume();
    }
  };

  unlock(): void {
    if (!this.context) {
      return;
    }

    if (this.context.state === 'suspended' && !this.suspendedByFocusLoss) {
      this.context.resume().catch(err => {
        console.warn('[AudioService] Failed to resume AudioContext:', err);
      });
    }
  }

  /**
   * Stops all active playbacks.
   */
  stopAll(): void {
    const playbacks = Array.from(this.activePlaybacks);
    this.activePlaybacks.clear();
    for (const playback of playbacks) {
      try {
        playback.stop();
      } catch (err) {
        // Ignore
      }
    }
  }

  play(buffer: AudioBuffer, options?: PlayAudioOptions): AudioPlayback {
    if (!this.context || !this.masterGain) {
      console.warn('[AudioService] Cannot play audio: AudioContext is unavailable.');
      return {
        stop: () => {
          // no-op
        },
      };
    }

    if (this.context.state === 'suspended' && !this.suspendedByFocusLoss) {
      console.warn(
        '[AudioService] Attempting to play audio while context is suspended. It might not be audible until user interaction.'
      );
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = options?.loop ?? false;

    const gainNode = this.context.createGain();
    gainNode.gain.value = options?.volume ?? 1.0;

    source.connect(gainNode);
    gainNode.connect(this.masterGain);

    source.start();

    const playback: AudioPlayback = {
      stop: () => {
        try {
          source.stop();
          source.disconnect();
          gainNode.disconnect();
        } catch (err) {
          // Ignore errors if already stopped
        } finally {
          this.activePlaybacks.delete(playback);
        }
      },
    };

    source.onended = () => {
      this.activePlaybacks.delete(playback);
    };

    this.activePlaybacks.add(playback);

    return playback;
  }

  async decodeAudioData(audioData: ArrayBuffer): Promise<AudioBuffer> {
    if (!this.context) {
      throw new Error('AudioContext is unavailable.');
    }

    return this.context.decodeAudioData(audioData);
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.unlockFromPointerDown);
    window.removeEventListener('keydown', this.unlockFromKeydown);
    window.removeEventListener('blur', this.handleActivityChange);
    window.removeEventListener('focus', this.handleActivityChange);
    window.removeEventListener('pageshow', this.handleActivityChange);
    window.removeEventListener('pagehide', this.handleActivityChange);
    document.removeEventListener('visibilitychange', this.handleActivityChange);

    this.stopAll();
    void this.context?.close();
    this.context = null;
    this.masterGain = null;
    this.suspendedByFocusLoss = false;
  }
}
