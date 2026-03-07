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
    window.addEventListener('pointerdown', () => this.unlock(), { once: true });
    window.addEventListener('keydown', () => this.unlock(), { once: true });
  }

  unlock(): void {
    if (!this.context) {
      return;
    }

    if (this.context.state === 'suspended') {
      this.context.resume().catch(err => {
        console.warn('[AudioService] Failed to resume AudioContext:', err);
      });
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

    if (this.context.state === 'suspended') {
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

    return {
      stop: () => {
        try {
          source.stop();
          source.disconnect();
          gainNode.disconnect();
        } catch (err) {
          // Ignore errors if already stopped
        }
      },
    };
  }

  async decodeAudioData(audioData: ArrayBuffer): Promise<AudioBuffer> {
    if (!this.context) {
      throw new Error('AudioContext is unavailable.');
    }

    return this.context.decodeAudioData(audioData);
  }
}
