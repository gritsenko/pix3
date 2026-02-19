import { describe, expect, it } from 'vitest';

import type { CommandContext } from '@/core/command';

import { StandaloneBuildService } from './StandaloneBuildService';

type InMemoryFs = {
  readTextFile: (path: string) => Promise<string>;
  writeTextFile: (path: string, contents: string) => Promise<void>;
  createDirectory: (path: string) => Promise<void>;
  listDirectory: (
    path: string
  ) => Promise<ReadonlyArray<{ name: string; kind: FileSystemHandleKind; path: string }>>;
  files: Map<string, string>;
  writes: string[];
};

const createInMemoryFs = (initialFiles: Record<string, string>): InMemoryFs => {
  const files = new Map<string, string>(Object.entries(initialFiles));
  const writes: string[] = [];

  return {
    files,
    writes,
    readTextFile: async (path: string): Promise<string> => {
      const value = files.get(path);
      if (typeof value !== 'string') {
        throw new Error(`File not found: ${path}`);
      }
      return value;
    },
    writeTextFile: async (path: string, contents: string): Promise<void> => {
      files.set(path, contents);
      writes.push(path);
    },
    createDirectory: async (_path: string): Promise<void> => {
      // Directory creation is tracked internally by the service result.
    },
    listDirectory: async (_path: string) => {
      return [];
    },
  };
};

const createContext = (): CommandContext => {
  const state = {
    project: {
      status: 'ready',
      projectName: 'Standalone Demo',
    },
    scenes: {
      activeSceneId: 'scene-1',
      descriptors: {
        'scene-1': {
          id: 'scene-1',
          filePath: 'scenes/main.pix3scene',
        },
      },
    },
  };

  return {
    state: state as unknown as CommandContext['state'],
    snapshot: {} as CommandContext['snapshot'],
    container: {} as CommandContext['container'],
    requestedAt: Date.now(),
  };
};

describe('StandaloneBuildService', () => {
  it('generates standalone files and copies runtime sources', async () => {
    const fs = createInMemoryFs({
      'package.json': JSON.stringify(
        {
          name: 'project-demo',
          scripts: {
            test: 'vitest',
          },
        },
        null,
        2
      ),
      'scenes/main.pix3scene': 'root:\n  node:\n    texture: res://assets/hero.png\n',
    });

    const service = new StandaloneBuildService();
    Object.defineProperty(service, 'fs', {
      value: fs,
      configurable: true,
    });

    const result = await service.buildFromTemplates(createContext());

    expect(fs.files.has('standalone/index.html')).toBe(true);
    expect(fs.files.has('standalone/src/main.ts')).toBe(true);
    expect(fs.files.has('standalone/src/generated/scene-manifest.ts')).toBe(true);
    expect(fs.files.has('standalone/asset-manifest.json')).toBe(true);
    expect(fs.files.has('standalone/runtime/src/index.ts')).toBe(true);
    expect(fs.files.has('standalone/runtime/package.json')).toBe(true);
    expect(fs.files.has('standalone/runtime/tsconfig.json')).toBe(true);

    const packageJsonRaw = fs.files.get('package.json');
    expect(typeof packageJsonRaw).toBe('string');
    const packageJson = JSON.parse(packageJsonRaw ?? '{}') as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.build).toBe(
      'vite build --config standalone/vite.config.ts'
    );
    expect(packageJson.scripts?.['build:pix3']).toBe(
      'vite build --config standalone/vite.config.ts'
    );
    expect(packageJson.scripts?.test).toBe('vitest');

    expect(result.sceneCount).toBe(1);
    expect(result.assetCount).toBe(2);
    expect(result.packageJsonUpdated).toBe(true);
    expect(result.writtenFiles).toBeGreaterThan(10);
  });

  it('preserves existing build script and adds build:pix3', async () => {
    const fs = createInMemoryFs({
      'package.json': JSON.stringify(
        {
          name: 'project-demo',
          scripts: {
            build: 'my-custom-build',
          },
        },
        null,
        2
      ),
      'scenes/main.pix3scene': 'root:\n  node:\n',
    });

    const service = new StandaloneBuildService();
    Object.defineProperty(service, 'fs', {
      value: fs,
      configurable: true,
    });

    await service.buildFromTemplates(createContext());

    const packageJson = JSON.parse(fs.files.get('package.json') ?? '{}') as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.build).toBe('my-custom-build');
    expect(packageJson.scripts?.['build:pix3']).toBe(
      'vite build --config standalone/vite.config.ts'
    );
  });
});
