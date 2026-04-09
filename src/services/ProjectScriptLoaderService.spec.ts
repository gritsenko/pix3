import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appState, resetAppState } from '@/state';

const { ProjectScriptLoaderService } = await import('./ProjectScriptLoaderService');

describe('ProjectScriptLoaderService.ensureReady', () => {
  beforeEach(() => {
    resetAppState();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetAppState();
  });

  it('waits for project scripts to finish loading before resolving', async () => {
    appState.project.status = 'ready';
    appState.project.scriptsStatus = 'idle';

    const service = new ProjectScriptLoaderService();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const syncAndBuild = vi.fn(async () => {
      appState.project.scriptsStatus = 'loading';
      window.setTimeout(() => {
        appState.project.scriptsStatus = 'ready';
      }, 0);
    });

    Object.defineProperty(service, 'logger', { value: logger });
    Object.defineProperty(service, 'syncAndBuild', { value: syncAndBuild });

    await service.ensureReady();

    expect(syncAndBuild).toHaveBeenCalledTimes(1);
    expect(appState.project.scriptsStatus).toBe('ready');

    service.dispose();
  });
});
