import { describe, expect, it, vi } from 'vitest';

import type { CommandContext } from '@/core/command';

import { OpenProjectSyncCommand } from './OpenProjectSyncCommand';

const createContext = (state: unknown): CommandContext => ({
  state: state as CommandContext['state'],
  snapshot: {} as CommandContext['snapshot'],
  container: {
    getOrCreateToken: <T>(token: T): T => token,
    getService: <T>(): T => {
      throw new Error('Unexpected getService call in this test');
    },
  } as unknown as CommandContext['container'],
  requestedAt: Date.now(),
});

describe('OpenProjectSyncCommand', () => {
  it('fails precondition when no project is open', () => {
    const command = new OpenProjectSyncCommand();

    const result = command.preconditions(
      createContext({
        project: { status: 'idle' },
      })
    );

    expect(result.canExecute).toBe(false);
    if (!result.canExecute) {
      expect(result.reason).toBe('Project must be opened to synchronize it');
      expect(result.scope).toBe('project');
    }
  });

  it('opens the sync dialog without mutating project state', async () => {
    const command = new OpenProjectSyncCommand();
    const projectSyncService = {
      showDialog: vi.fn(async () => undefined),
    };

    Object.defineProperty(command, 'projectSyncService', {
      value: projectSyncService,
      configurable: true,
    });

    const result = await command.execute();

    expect(projectSyncService.showDialog).toHaveBeenCalledTimes(1);
    expect(result.didMutate).toBe(false);
    expect(result.payload).toBeUndefined();
  });
});
