import { injectable } from '@/fw/di';
import type { BehaviorTypeInfo, ControllerTypeInfo } from './ScriptRegistry';

export type ScriptTypeInfo = BehaviorTypeInfo | ControllerTypeInfo;

export interface BehaviorPickerInstance {
  id: string;
  type: 'behavior' | 'controller';
  resolve: (result: ScriptTypeInfo | null) => void;
  reject: (error: Error) => void;
}

@injectable()
export class BehaviorPickerService {
  private pickers = new Map<string, BehaviorPickerInstance>();
  private nextId = 0;
  private listeners = new Set<(pickers: BehaviorPickerInstance[]) => void>();

  /**
   * Show the behavior picker modal and return a promise that resolves to the selected behavior or null if cancelled.
   */
  public async showPicker(
    type: 'behavior' | 'controller' = 'behavior'
  ): Promise<ScriptTypeInfo | null> {
    return new Promise((resolve, reject) => {
      const id = `picker-${this.nextId++}`;
      const instance: BehaviorPickerInstance = {
        id,
        type,
        resolve: (result: ScriptTypeInfo | null) => {
          this.pickers.delete(id);
          this.notifyListeners();
          resolve(result);
        },
        reject: (error: Error) => {
          this.pickers.delete(id);
          this.notifyListeners();
          reject(error);
        },
      };

      this.pickers.set(id, instance);
      this.notifyListeners();
    });
  }

  /**
   * Get all active pickers for rendering
   */
  public getPickers(): BehaviorPickerInstance[] {
    return Array.from(this.pickers.values());
  }

  /**
   * Subscribe to picker changes
   */
  public subscribe(listener: (pickers: BehaviorPickerInstance[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Select a script by ID
   */
  public select(pickerId: string, script: ScriptTypeInfo): void {
    const instance = this.pickers.get(pickerId);
    if (instance) {
      instance.resolve(script);
    }
  }

  /**
   * Cancel a picker by ID
   */
  public cancel(pickerId: string): void {
    const instance = this.pickers.get(pickerId);
    if (instance) {
      instance.resolve(null);
    }
  }

  private notifyListeners(): void {
    const pickers = this.getPickers();
    for (const listener of this.listeners) {
      listener(pickers);
    }
  }

  public dispose(): void {
    this.pickers.clear();
    this.listeners.clear();
  }
}
