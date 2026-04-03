import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appState, resetAppState } from '@/state';

const mockApiClient = {
  createDirectory: vi.fn(),
  getManifest: vi.fn(),
};

vi.mock('./ApiClient', () => mockApiClient);

const { ProjectStorageService } = await import('./ProjectStorageService');

describe('ProjectStorageService', () => {
  let service: InstanceType<typeof ProjectStorageService>;
  let mockFileSystem: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    resetAppState();
    appState.project.backend = 'cloud';
    appState.project.id = 'project-1';

    service = new ProjectStorageService();
    mockFileSystem = {
      listDirectory: vi.fn(),
      readBlob: vi.fn(),
      writeBinaryFile: vi.fn(),
      deleteEntry: vi.fn(),
      createDirectory: vi.fn(),
    };
    Object.defineProperty(service, 'fileSystem', {
      value: mockFileSystem,
      configurable: true,
    });

    mockApiClient.createDirectory.mockReset();
    mockApiClient.getManifest.mockReset();
  });

  afterEach(() => {
    resetAppState();
  });

  it('creates cloud directories via the API and refreshes the manifest cache', async () => {
    mockApiClient.createDirectory.mockResolvedValue({ path: 'folder' });
    mockApiClient.getManifest.mockResolvedValue({
      files: [{ path: 'folder', kind: 'directory', size: 0, hash: '', modified: '2026-04-03' }],
    });

    await service.createDirectory('folder');

    expect(mockApiClient.createDirectory).toHaveBeenCalledWith('project-1', 'folder');
    expect(mockApiClient.getManifest).toHaveBeenCalledWith('project-1');
  });

  it('lists empty cloud directories from manifest entries', async () => {
    mockApiClient.getManifest.mockResolvedValue({
      files: [{ path: 'folder', kind: 'directory', size: 0, hash: '', modified: '2026-04-03' }],
    });

    await expect(service.listDirectory('.')).resolves.toEqual([
      { name: 'folder', path: 'folder', kind: 'directory' },
    ]);
  });

  it('moves files through binary copy+delete so asset bytes are preserved', async () => {
    appState.project.backend = 'local';
    const blob = new Blob(['png-bytes']);

    mockFileSystem.listDirectory.mockResolvedValueOnce([
      { name: 'hero.png', path: 'assets/hero.png', kind: 'file' },
    ]);
    mockFileSystem.readBlob.mockResolvedValue(blob);
    mockFileSystem.writeBinaryFile.mockResolvedValue(undefined);
    mockFileSystem.deleteEntry.mockResolvedValue(undefined);

    await service.moveEntry('assets/hero.png', 'icons/hero.png');

    expect(mockFileSystem.readBlob).toHaveBeenCalledWith('assets/hero.png');
    expect(mockFileSystem.writeBinaryFile).toHaveBeenCalledTimes(1);
    expect(mockFileSystem.deleteEntry).toHaveBeenCalledWith('assets/hero.png');
  });
});
