import { describe, expect, it, vi } from 'vitest';

import type { CommandContext } from '@/core/command';

import { BuildProjectCommand } from './BuildProjectCommand';

const createContext = (state: unknown): CommandContext => {
  return {
    state: state as CommandContext['state'],
    snapshot: {} as CommandContext['snapshot'],
    container: {
      getOrCreateToken: <T>(token: T): T => token,
      getService: <T>(): T => {
        throw new Error('Unexpected getService call in this test');
      },
    } as unknown as CommandContext['container'],
    requestedAt: Date.now(),
  };
};

describe('BuildProjectCommand', () => {
  it('fails precondition when project is not ready', () => {
    const command = new BuildProjectCommand();

    const context = createContext({
      project: { status: 'idle', projectName: '' },
      scenes: { descriptors: {}, activeSceneId: null },
    });

    const result = command.preconditions(context);

    expect(result.canExecute).toBe(false);
    if (!result.canExecute) {
      expect(result.reason).toBe('Project must be opened');
      expect(result.scope).toBe('project');
    }
  });

  it('fails precondition when there are no loaded scenes', () => {
    const command = new BuildProjectCommand();

    const context = createContext({
      project: { status: 'ready', projectName: 'Demo' },
      scenes: { descriptors: {}, activeSceneId: null },
    });

    const result = command.preconditions(context);

    expect(result.canExecute).toBe(false);
    if (!result.canExecute) {
      expect(result.reason).toBe('At least one loaded scene is required');
      expect(result.scope).toBe('scene');
    }
  });

  it('executes runtime project build and returns non-mutating result', async () => {
    const command = new BuildProjectCommand();
    const service = {
      buildFromTemplates: vi.fn(async () => ({
        writtenFiles: 10,
        createdDirectories: 3,
        sceneCount: 1,
        assetCount: 2,
        packageJsonUpdated: true,
      })),
    };
    const dialogService = {
      showConfirmation: vi.fn(async () => true),
    };
    const loggingService = {
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    };
    Object.defineProperty(command, 'projectBuildService', {
      value: service,
      configurable: true,
    });
    Object.defineProperty(command, 'dialogService', {
      value: dialogService,
      configurable: true,
    });
    Object.defineProperty(command, 'loggingService', {
      value: loggingService,
      configurable: true,
    });

    const context = createContext({
      project: { status: 'ready', projectName: 'Demo' },
      scenes: {
        descriptors: {
          scene1: { filePath: 'scenes/main.pix3scene' },
        },
        activeSceneId: 'scene1',
      },
    });

    const result = await command.execute(context);

    expect(service.buildFromTemplates).toHaveBeenCalledWith(context);
    expect(dialogService.showConfirmation).toHaveBeenCalledTimes(1);
    expect(loggingService.info).toHaveBeenCalled();
    expect(result.didMutate).toBe(false);
    expect(result.payload).toBeUndefined();
  });
});