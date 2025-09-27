import type { AppStateSnapshot } from '../../state';

export interface HistoryEntryMetadata {
  readonly commandId?: string;
  readonly label?: string;
  readonly description?: string;
  readonly coalesceKey?: string;
  readonly tags?: readonly string[];
}

export interface HistoryEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly metadata: HistoryEntryMetadata;
  readonly undo: () => Promise<void> | void;
  readonly redo: () => Promise<void> | void;
  readonly beforeSnapshot?: AppStateSnapshot;
  readonly afterSnapshot?: AppStateSnapshot;
}

export interface HistoryEntryInit extends Omit<HistoryEntry, 'id' | 'timestamp'> {
  readonly id?: string;
  readonly timestamp?: number;
}

export interface HistorySnapshot {
  readonly undoEntries: readonly HistoryEntry[];
  readonly redoEntries: readonly HistoryEntry[];
  readonly capacity: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export type HistoryListener = (snapshot: HistorySnapshot) => void;

export interface HistoryManagerOptions {
  readonly capacity?: number;
}

const DEFAULT_CAPACITY = 100;

const generateId = (() => {
  let counter = 0;
  return (prefix = 'history'): string => {
    const uuidProvider = (globalThis as any).crypto?.randomUUID?.bind((globalThis as any).crypto);
    if (uuidProvider) {
      return uuidProvider();
    }
    counter += 1;
    return `${prefix}-${Date.now()}-${counter}`;
  };
})();

export class HistoryManager {
  private capacity: number;
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];
  private readonly listeners = new Set<HistoryListener>();

  constructor(options: HistoryManagerOptions = {}) {
    this.capacity = Math.max(1, options.capacity ?? DEFAULT_CAPACITY);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getCapacity(): number {
    return this.capacity;
  }

  setCapacity(capacity: number): void {
    const normalized = Math.max(1, capacity);
    if (normalized === this.capacity) {
      return;
    }
    this.capacity = normalized;
    this.trimToCapacity();
    this.emitChange();
  }

  push(entryInit: HistoryEntryInit): HistoryEntry {
    const entry = this.createEntry(entryInit);

    this.undoStack.push(entry);
    this.trimToCapacity();
    this.redoStack.length = 0;
    this.emitChange();
    return entry;
  }

  replaceLast(entryInit: HistoryEntryInit): HistoryEntry {
    if (!this.undoStack.length) {
      return this.push(entryInit);
    }

    const previous = this.undoStack[this.undoStack.length - 1];
    const entry = this.createEntry(entryInit, previous.id, previous.timestamp);
    this.undoStack[this.undoStack.length - 1] = entry;
    this.redoStack.length = 0;
    this.emitChange();
    return entry;
  }

  async undo(): Promise<boolean> {
    if (!this.canUndo) {
      return false;
    }

    const entry = this.undoStack.pop()!;
    try {
      await entry.undo();
      this.redoStack.push(entry);
      this.emitChange();
      return true;
    } catch (error) {
      // Restore entry to undo stack so history remains consistent.
      this.undoStack.push(entry);
      this.emitChange();
      throw error;
    }
  }

  async redo(): Promise<boolean> {
    if (!this.canRedo) {
      return false;
    }

    const entry = this.redoStack.pop()!;
    try {
      await entry.redo();
      this.undoStack.push(entry);
      this.trimToCapacity();
      this.emitChange();
      return true;
    } catch (error) {
      // Restore entry to redo stack if redo fails.
      this.redoStack.push(entry);
      this.emitChange();
      throw error;
    }
  }

  clear(): void {
    if (!this.undoStack.length && !this.redoStack.length) {
      return;
    }
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.emitChange();
  }

  subscribe(listener: HistoryListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  snapshot(): HistorySnapshot {
    return {
      undoEntries: [...this.undoStack],
      redoEntries: [...this.redoStack],
      capacity: this.capacity,
      canUndo: this.canUndo,
      canRedo: this.canRedo,
    };
  }

  private trimToCapacity(): void {
    while (this.undoStack.length > this.capacity) {
      this.undoStack.shift();
    }
  }

  private emitChange(): void {
    if (!this.listeners.size) {
      return;
    }
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private createEntry(
    entryInit: HistoryEntryInit,
    fallbackId?: string,
    fallbackTimestamp?: number
  ): HistoryEntry {
    return {
      ...entryInit,
      id: entryInit.id ?? fallbackId ?? generateId('history'),
      timestamp: entryInit.timestamp ?? fallbackTimestamp ?? Date.now(),
    };
  }
}
