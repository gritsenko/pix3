import type { ECSRegistration, ECSServiceOptions, ECSSystem, ECSUpdateContext } from './ecs';
import type { InputService } from './InputService';
import type { SceneService } from './SceneService';

interface RegisteredWorld {
  world: ECSRegistration['world'];
  systems: readonly ECSSystem[];
}

const DEFAULT_FIXED_TIME_STEP = 1 / 60;
const DEFAULT_MAX_FIXED_STEPS = 4;

export class ECSService {
  readonly fixedTimeStep: number;
  readonly maxFixedStepsPerFrame: number;

  private readonly registrations: RegisteredWorld[] = [];
  private scene: SceneService | null = null;
  private input: InputService | null = null;
  private elapsedTime = 0;
  private frame = 0;
  private alpha = 0;

  constructor(options: ECSServiceOptions = {}) {
    this.fixedTimeStep =
      typeof options.fixedTimeStep === 'number' && options.fixedTimeStep > 0
        ? options.fixedTimeStep
        : DEFAULT_FIXED_TIME_STEP;
    this.maxFixedStepsPerFrame =
      typeof options.maxFixedStepsPerFrame === 'number' && options.maxFixedStepsPerFrame > 0
        ? Math.max(1, Math.floor(options.maxFixedStepsPerFrame))
        : DEFAULT_MAX_FIXED_STEPS;
  }

  registerWorld<TWorld>(registration: ECSRegistration<TWorld>): () => void {
    const record: RegisteredWorld = {
      world: registration.world,
      systems: [...registration.systems],
    };
    this.registrations.push(record);

    const initContext = this.tryCreateContext(0, this.elapsedTime, this.frame, this.alpha);
    if (initContext && record.world.initialize) {
      record.world.initialize(initContext);
    }

    return () => {
      const index = this.registrations.indexOf(record);
      if (index === -1) {
        return;
      }

      this.disposeRegistration(record);
      this.registrations.splice(index, 1);
    };
  }

  clear(): void {
    while (this.registrations.length > 0) {
      const registration = this.registrations.pop();
      if (registration) {
        this.disposeRegistration(registration);
      }
    }
  }

  dispose(): void {
    this.clear();
    this.scene = null;
    this.input = null;
    this.elapsedTime = 0;
    this.frame = 0;
    this.alpha = 0;
  }

  beginScene(scene: SceneService, input: InputService): void {
    this.scene = scene;
    this.input = input;
    this.elapsedTime = 0;
    this.frame = 0;
    this.alpha = 0;

    const initContext = this.tryCreateContext(0, 0, 0, 0);
    if (!initContext) {
      return;
    }

    for (const registration of this.registrations) {
      registration.world.initialize?.(initContext);
    }
  }

  endScene(): void {
    this.scene = null;
    this.input = null;
    this.elapsedTime = 0;
    this.frame = 0;
    this.alpha = 0;
  }

  setInterpolationAlpha(alpha: number): void {
    this.alpha = Number.isFinite(alpha) ? Math.max(0, alpha) : 0;
  }

  setFrameMetrics(time: number, frame: number): void {
    this.elapsedTime = Number.isFinite(time) ? Math.max(0, time) : this.elapsedTime;
    this.frame = Number.isFinite(frame) ? Math.max(0, Math.floor(frame)) : this.frame;
  }

  update(dt: number, alpha: number = this.alpha): void {
    const nextDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.alpha = Number.isFinite(alpha) ? Math.max(0, alpha) : this.alpha;
    const context = this.tryCreateContext(nextDt, this.elapsedTime, this.frame, this.alpha);
    if (!context) {
      return;
    }

    this.runPhase('update', context);
  }

  fixedUpdate(dt: number): void {
    const nextDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const context = this.tryCreateContext(nextDt, this.elapsedTime, this.frame, this.alpha);
    if (!context) {
      return;
    }

    this.runPhase('fixedUpdate', context);
  }

  private runPhase(phase: ECSSystem['phase'], context: ECSUpdateContext): void {
    for (const registration of this.registrations) {
      for (const system of registration.systems) {
        if (system.phase === phase) {
          system.update(context);
        }
      }
    }
  }

  private tryCreateContext(
    dt: number,
    time: number,
    frame: number,
    alpha: number
  ): ECSUpdateContext | null {
    if (!this.scene || !this.input) {
      return null;
    }

    return {
      dt,
      time,
      frame,
      fixedTimeStep: this.fixedTimeStep,
      alpha,
      scene: this.scene,
      input: this.input,
    };
  }

  private disposeRegistration(registration: RegisteredWorld): void {
    registration.world.dispose?.();
  }
}
