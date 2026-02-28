import { Script } from '../core/ScriptComponent';
import type { PropertySchema } from '../fw/property-schema';
import { Node2D } from '../nodes/Node2D';

type FadeDirection = 'in' | 'out';

export class FadeBehavior extends Script {
  private fadeDirection: FadeDirection | null = null;
  private phase: 'idle' | 'delay' | 'fade' = 'idle';
  private pendingDestroy: boolean = false;
  private delayRemaining = 0;
  private fadeElapsed = 0;
  private fadeDuration = 0;
  private fadeFrom = 1;
  private fadeTo = 1;
  private sequenceStarted = false;

  constructor(id: string, type: string) {
    super(id, type);
    this.config = {
      FadeInTime: 0.5,
      FadeOutTime: 0.5,
      FadeInDelay: 0,
      FadeOutDelay: 0,
      DestroyOnFadeOut: false,
      FadeOnStart: false,
    };
  }

  static getPropertySchema(): PropertySchema {
    return {
      nodeType: 'FadeBehavior',
      properties: [
        {
          name: 'FadeInTime',
          type: 'number',
          ui: {
            label: 'FadeInTime',
            group: 'Fade',
            min: 0,
            step: 0.01,
            precision: 2,
            unit: 's',
          },
          getValue: (component: unknown) => (component as FadeBehavior).getFadeInTime(),
          setValue: (component: unknown, value: unknown) => {
            (component as FadeBehavior).setFadeInTime(value);
          },
        },
        {
          name: 'FadeOutTime',
          type: 'number',
          ui: {
            label: 'FadeOutTime',
            group: 'Fade',
            min: 0,
            step: 0.01,
            precision: 2,
            unit: 's',
          },
          getValue: (component: unknown) => (component as FadeBehavior).getFadeOutTime(),
          setValue: (component: unknown, value: unknown) => {
            (component as FadeBehavior).setFadeOutTime(value);
          },
        },
        {
          name: 'FadeInDelay',
          type: 'number',
          ui: {
            label: 'FadeInDelay',
            group: 'Fade',
            min: 0,
            step: 0.01,
            precision: 2,
            unit: 's',
          },
          getValue: (component: unknown) => (component as FadeBehavior).getFadeInDelay(),
          setValue: (component: unknown, value: unknown) => {
            (component as FadeBehavior).setFadeInDelay(value);
          },
        },
        {
          name: 'FadeOutDelay',
          type: 'number',
          ui: {
            label: 'FadeOutDelay',
            group: 'Fade',
            min: 0,
            step: 0.01,
            precision: 2,
            unit: 's',
          },
          getValue: (component: unknown) => (component as FadeBehavior).getFadeOutDelay(),
          setValue: (component: unknown, value: unknown) => {
            (component as FadeBehavior).setFadeOutDelay(value);
          },
        },
        {
          name: 'DestroyOnFadeOut',
          type: 'boolean',
          ui: {
            label: 'DestroyOnFadeOut',
            group: 'Fade',
          },
          getValue: (component: unknown) => (component as FadeBehavior).getDestroyOnFadeOut(),
          setValue: (component: unknown, value: unknown) => {
            (component as FadeBehavior).setDestroyOnFadeOut(value);
          },
        },
        {
          name: 'FadeOnStart',
          type: 'boolean',
          ui: {
            label: 'FadeOnStart',
            group: 'Fade',
          },
          getValue: (component: unknown) => (component as FadeBehavior).getFadeOnStart(),
          setValue: (component: unknown, value: unknown) => {
            (component as FadeBehavior).setFadeOnStart(value);
          },
        },
      ],
      groups: {
        Fade: {
          label: 'Fade',
          description: 'Opacity fade settings',
          expanded: true,
        },
      },
    };
  }

  onStart(): void {
    if (!this.isNode2D()) {
      return;
    }

    if (!this.getFadeOnStart()) {
      return;
    }

    this.sequenceStarted = true;

    this.node.opacity = 0;
    this.startFade('in');
  }

  onUpdate(dt: number): void {
    if (!this.isNode2D()) {
      return;
    }

    if (this.pendingDestroy) {
      this.pendingDestroy = false;
      this.destroyNode();
      return;
    }

    if (this.phase === 'delay') {
      this.delayRemaining = Math.max(0, this.delayRemaining - dt);
      if (this.delayRemaining === 0) {
        this.phase = 'fade';
      }
    }

    if (this.phase === 'fade') {
      if (this.fadeDuration <= 0) {
        this.applyOpacity(this.fadeTo);
        this.finishFade();
      } else {
        this.fadeElapsed = Math.min(this.fadeDuration, this.fadeElapsed + dt);
        const t = this.fadeElapsed / this.fadeDuration;
        const nextOpacity = this.fadeFrom + (this.fadeTo - this.fadeFrom) * t;
        this.applyOpacity(nextOpacity);
        if (this.fadeElapsed >= this.fadeDuration) {
          this.finishFade();
        }
      }
    }

  }

  onDetach(): void {
    super.onDetach();
    this.stopFade();
    this.pendingDestroy = false;
    this.sequenceStarted = false;
  }

  fadeIn(): void {
    this.sequenceStarted = false;
    this.startFade('in');
  }

  fadeOut(): void {
    this.sequenceStarted = false;
    this.startFade('out');
  }

  private startFade(direction: FadeDirection): void {
    if (!this.isNode2D()) {
      return;
    }

    this.pendingDestroy = false;
    this.fadeDirection = direction;
    this.fadeElapsed = 0;
    this.fadeFrom = this.node.opacity;
    this.fadeTo = direction === 'in' ? 1 : 0;
    this.fadeDuration = direction === 'in' ? this.getFadeInTime() : this.getFadeOutTime();

    const delay = direction === 'in' ? this.getFadeInDelay() : this.getFadeOutDelay();
    if (delay > 0) {
      this.phase = 'delay';
      this.delayRemaining = delay;
      return;
    }

    this.phase = 'fade';
    this.delayRemaining = 0;
  }

  private stopFade(): void {
    this.fadeDirection = null;
    this.phase = 'idle';
    this.delayRemaining = 0;
    this.fadeElapsed = 0;
    this.fadeDuration = 0;
    this.fadeFrom = 1;
    this.fadeTo = 1;
  }

  private finishFade(): void {
    const direction = this.fadeDirection;
    this.stopFade();

    if (direction === 'in' && this.sequenceStarted) {
      this.startFade('out');
      return;
    }

    if (direction === 'out' && this.getDestroyOnFadeOut()) {
      this.pendingDestroy = true;
    }
  }

  private destroyNode(): void {
    if (!this.node) {
      return;
    }
    const parentNode = this.node.parentNode;
    if (!parentNode) {
      return;
    }
    parentNode.disownChild(this.node);
  }

  private applyOpacity(value: number): void {
    if (!this.isNode2D()) {
      return;
    }
    this.node.opacity = FadeBehavior.clamp01(value);
  }

  private isNode2D(): this is this & { node: Node2D } {
    return this.node instanceof Node2D;
  }

  private getFadeInTime(): number {
    return FadeBehavior.toNonNegativeNumber(this.config.FadeInTime, 0.5);
  }

  private setFadeInTime(value: unknown): void {
    this.config.FadeInTime = FadeBehavior.toNonNegativeNumber(value, 0.5);
  }

  private getFadeOutTime(): number {
    return FadeBehavior.toNonNegativeNumber(this.config.FadeOutTime, 0.5);
  }

  private setFadeOutTime(value: unknown): void {
    this.config.FadeOutTime = FadeBehavior.toNonNegativeNumber(value, 0.5);
  }

  private getFadeInDelay(): number {
    return FadeBehavior.toNonNegativeNumber(this.config.FadeInDelay, 0);
  }

  private setFadeInDelay(value: unknown): void {
    this.config.FadeInDelay = FadeBehavior.toNonNegativeNumber(value, 0);
  }

  private getFadeOutDelay(): number {
    return FadeBehavior.toNonNegativeNumber(this.config.FadeOutDelay, 0);
  }

  private setFadeOutDelay(value: unknown): void {
    this.config.FadeOutDelay = FadeBehavior.toNonNegativeNumber(value, 0);
  }

  private getDestroyOnFadeOut(): boolean {
    return !!this.config.DestroyOnFadeOut;
  }

  private setDestroyOnFadeOut(value: unknown): void {
    this.config.DestroyOnFadeOut = !!value;
  }

  private getFadeOnStart(): boolean {
    return !!this.config.FadeOnStart;
  }

  private setFadeOnStart(value: unknown): void {
    this.config.FadeOnStart = !!value;
  }

  private static toNonNegativeNumber(value: unknown, fallback: number): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.max(0, parsed);
  }

  private static clamp01(value: number): number {
    if (!Number.isFinite(value)) {
      return 1;
    }
    return Math.min(1, Math.max(0, value));
  }
}