import { describe, expect, it, beforeEach } from 'vitest';
import type { OperationContext } from '@/core/Operation';
import { createInitialAppState } from '@/state/AppState';
import {
  EDITOR_SETTINGS_STORAGE_KEY,
  UpdateEditorSettingsOperation,
  loadEditorSettings,
} from './UpdateEditorSettingsOperation';

const createStorageStub = (): Storage => {
  const data = new Map<string, string>();

  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
};

describe('UpdateEditorSettingsOperation', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorageStub(),
      configurable: true,
      writable: true,
    });
  });

  it('persists gameAspectRatio changes and supports undo/redo', async () => {
    const state = createInitialAppState();
    const context = {
      state,
      snapshot: structuredClone(state),
      container: {} as OperationContext['container'],
      requestedAt: Date.now(),
    } as OperationContext;

    const operation = new UpdateEditorSettingsOperation({
      gameAspectRatio: '16:9-landscape',
    });

    const result = await operation.perform(context);

    expect(result.didMutate).toBe(true);
    expect(state.ui.gameAspectRatio).toBe('16:9-landscape');

    const stored = JSON.parse(localStorage.getItem(EDITOR_SETTINGS_STORAGE_KEY) ?? '{}') as {
      gameAspectRatio?: string;
    };
    expect(stored.gameAspectRatio).toBe('16:9-landscape');

    await result.commit?.undo();
    expect(state.ui.gameAspectRatio).toBe('free');

    await result.commit?.redo();
    expect(state.ui.gameAspectRatio).toBe('16:9-landscape');
  });

  it('loads persisted gameAspectRatio from storage', () => {
    localStorage.setItem(
      EDITOR_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        warnOnUnsavedUnload: false,
        pauseRenderingOnUnfocus: true,
        navigation2D: {
          panSensitivity: 1,
          zoomSensitivity: 1,
        },
        gameAspectRatio: '4:3',
      })
    );

    const settings = loadEditorSettings();

    expect(settings?.gameAspectRatio).toBe('4:3');
  });
});
