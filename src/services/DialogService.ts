import { injectable } from '@/fw/di';

export interface DialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDangerous?: boolean;
}

export interface DialogInstance {
  id: string;
  options: DialogOptions;
  resolve: (result: boolean) => void;
  reject: (error: Error) => void;
}

@injectable()
export class DialogService {
  private dialogs = new Map<string, DialogInstance>();
  private nextId = 0;
  private listeners = new Set<(dialogs: DialogInstance[]) => void>();

  /**
   * Show a confirmation dialog and return a promise that resolves to true if confirmed, false if cancelled.
   */
  public async showConfirmation(options: DialogOptions): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const id = `dialog-${this.nextId++}`;
      const instance: DialogInstance = {
        id,
        options: {
          confirmLabel: 'Confirm',
          cancelLabel: 'Cancel',
          isDangerous: false,
          ...options,
        },
        resolve: (result: boolean) => {
          this.dialogs.delete(id);
          this.notifyListeners();
          resolve(result);
        },
        reject: (error: Error) => {
          this.dialogs.delete(id);
          this.notifyListeners();
          reject(error);
        },
      };

      this.dialogs.set(id, instance);
      this.notifyListeners();
    });
  }

  /**
   * Get all active dialogs for rendering
   */
  public getDialogs(): DialogInstance[] {
    return Array.from(this.dialogs.values());
  }

  /**
   * Subscribe to dialog changes
   */
  public subscribe(listener: (dialogs: DialogInstance[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Confirm a dialog by ID
   */
  public confirm(id: string): void {
    const instance = this.dialogs.get(id);
    if (instance) {
      instance.resolve(true);
    }
  }

  /**
   * Cancel a dialog by ID
   */
  public cancel(id: string): void {
    const instance = this.dialogs.get(id);
    if (instance) {
      instance.resolve(false);
    }
  }

  private notifyListeners(): void {
    const dialogs = this.getDialogs();
    for (const listener of this.listeners) {
      listener(dialogs);
    }
  }

  public dispose(): void {
    this.dialogs.clear();
    this.listeners.clear();
  }
}

export function resolveDialogService(): DialogService {
  return new DialogService();
}
