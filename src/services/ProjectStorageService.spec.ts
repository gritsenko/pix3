import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { ServiceContainer, ServiceLifetime } from '@/fw/di';
import { appState, resetAppState } from '@/state';
import { CollaborationService } from './CollaborationService';

const mockApiClient = {
  createDirectory: vi.fn(),
  getManifest: vi.fn(),
  getManifestWithAccess: vi.fn(),
  uploadFile: vi.fn(),
  deleteFile: vi.fn(),
};

vi.mock('./ApiClient', () => mockApiClient);

const { ProjectStorageService } = await import('./ProjectStorageService');

class MockCollaborationService {
  readonly ydoc = new Y.Doc();

  getYDoc(): Y.Doc {
    return this.ydoc;
  }

  getLocalOrigin(): string {
    return 'pix3-local';
  }
}

describe('ProjectStorageService', () => {
  let service: InstanceType<typeof ProjectStorageService>;
  let mockFileSystem: Record<string, ReturnType<typeof vi.fn>>;
  let collabService: MockCollaborationService;

  beforeEach(() => {
    resetAppState();
    appState.project.backend = 'cloud';
    appState.project.id = 'project-1';
    ServiceContainer.getInstance().addService(
      ServiceContainer.getInstance().getOrCreateToken(CollaborationService),
      MockCollaborationService,
      ServiceLifetime.Singleton
    );
    collabService = ServiceContainer.getInstance().getService<MockCollaborationService>(
      ServiceContainer.getInstance().getOrCreateToken(CollaborationService)
    );

    service = new ProjectStorageService();
    mockFileSystem = {
      listDirectory: vi.fn(),
      readBlob: vi.fn(),
      writeTextFile: vi.fn(),
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
    mockApiClient.getManifestWithAccess.mockReset();
    mockApiClient.uploadFile.mockReset();
    mockApiClient.deleteFile.mockReset();
  });

  afterEach(() => {
    service.dispose();
    resetAppState();
  });

  it('creates cloud directories via the API and refreshes the manifest cache', async () => {
    mockApiClient.createDirectory.mockResolvedValue({ path: 'folder' });
    mockApiClient.getManifestWithAccess.mockResolvedValue({
      files: [{ path: 'folder', kind: 'directory', size: 0, hash: '', modified: '2026-04-03' }],
    });

    await service.createDirectory('folder');

    expect(mockApiClient.createDirectory).toHaveBeenCalledWith('project-1', 'folder');
    expect(mockApiClient.getManifestWithAccess).toHaveBeenCalledWith('project-1', undefined);
    expect(appState.project.lastModifiedDirectoryPath).toBe('.');
    expect(appState.project.fileRefreshSignal).toBe(1);
  });

  it('lists empty cloud directories from manifest entries', async () => {
    mockApiClient.getManifestWithAccess.mockResolvedValue({
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

  it('applies remote asset mutations to refresh the active directory', async () => {
    mockApiClient.getManifestWithAccess.mockResolvedValue({
      files: [{ path: 'assets/new.png', kind: 'file', size: 12, hash: '', modified: '2026-04-07' }],
    });

    const assetEvents = collabService.getYDoc().getMap<string>('asset-events');
    assetEvents.set(
      'lastMutation',
      JSON.stringify({
        id: 'evt-1',
        kind: 'write-file',
        path: 'assets/new.png',
        directories: ['assets'],
        occurredAt: Date.now(),
      })
    );

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockApiClient.getManifestWithAccess).toHaveBeenCalledWith('project-1', undefined);
    expect(appState.project.lastModifiedDirectoryPath).toBe('assets');
    expect(appState.project.fileRefreshSignal).toBeGreaterThan(0);
  });
});
