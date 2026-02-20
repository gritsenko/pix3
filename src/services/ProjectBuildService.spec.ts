import { describe, expect, it } from 'vitest';

import type { CommandContext } from '@/core/command';

import { ProjectBuildService } from './ProjectBuildService';

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
      projectName: 'Runtime Demo',
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

describe('ProjectBuildService', () => {
  it('generates runtime project files and copies runtime sources', async () => {
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

    const service = new ProjectBuildService();
    Object.defineProperty(service, 'fs', {
      value: fs,
      configurable: true,
    });

    const result = await service.buildFromTemplates(createContext());

    // Templates land at project root.
    expect(fs.files.has('index.html')).toBe(true);
    expect(fs.files.has('tsconfig.json')).toBe(true);
    expect(fs.files.has('vite.config.ts')).toBe(true);
    // App entry files land in src/.
    expect(fs.files.has('src/main.ts')).toBe(true);
    expect(fs.files.has('src/generated/scene-manifest.ts')).toBe(true);
    // Asset manifest at project root.
    expect(fs.files.has('asset-manifest.json')).toBe(true);
    // Engine library sources land in pix3-runtime/src/.
    expect(fs.files.has('pix3-runtime/src/index.ts')).toBe(true);

    // Root package.json receives build/dev scripts and preserves existing ones.
    const packageJsonRaw = fs.files.get('package.json');
    expect(typeof packageJsonRaw).toBe('string');
    const packageJson = JSON.parse(packageJsonRaw ?? '{}') as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.build).toBe('vite build');
    expect(packageJson.scripts?.dev).toBe('vite');
    expect(packageJson.scripts?.test).toBe('vitest');

    expect(result.sceneCount).toBe(1);
    expect(result.assetCount).toBe(2);
    expect(result.packageJsonUpdated).toBe(true);
    expect(result.writtenFiles).toBeGreaterThan(10);
  });

  it('merges runtime scripts into root package.json while preserving unrelated scripts', async () => {
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
      'scenes/main.pix3scene': 'root:\n  node:\n',
    });

    const service = new ProjectBuildService();
    Object.defineProperty(service, 'fs', {
      value: fs,
      configurable: true,
    });

    await service.buildFromTemplates(createContext());

    const packageJson = JSON.parse(fs.files.get('package.json') ?? '{}') as {
      scripts?: Record<string, string>;
    };

    // Service sets build/dev scripts; existing test script is preserved.
    expect(packageJson.scripts?.build).toBe('vite build');
    expect(packageJson.scripts?.dev).toBe('vite');
    expect(packageJson.scripts?.test).toBe('vitest');
  });
});