import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appState, resetAppState } from '@/state';
import type { AssetsPreviewSnapshot } from './AssetsPreviewService';

const mockProjectService = {
  listDirectory: vi.fn(),
};

const mockFileSystemService = {
  readBlob: vi.fn(),
};

const mockThumbnailCacheService = {
  get: vi.fn(),
  set: vi.fn(),
};

const mockThumbnailGenerator = {
  generate: vi.fn(),
};

vi.mock('./ProjectService', () => ({
  ProjectService: class ProjectService {},
  resolveProjectService: () => mockProjectService,
}));

vi.mock('./FileSystemAPIService', () => ({
  FileSystemAPIService: class FileSystemAPIService {},
  resolveFileSystemAPIService: () => mockFileSystemService,
}));

vi.mock('./ThumbnailCacheService', () => ({
  ThumbnailCacheService: class ThumbnailCacheService {},
  resolveThumbnailCacheService: () => mockThumbnailCacheService,
}));

vi.mock('./ThumbnailGenerator', () => ({
  ThumbnailGenerator: class ThumbnailGenerator {},
  resolveThumbnailGenerator: () => mockThumbnailGenerator,
}));

const { AssetsPreviewService } = await import('./AssetsPreviewService');

describe('AssetsPreviewService', () => {
  beforeEach(() => {
    resetAppState();
    appState.project.status = 'ready';

    mockProjectService.listDirectory.mockReset();
    mockFileSystemService.readBlob.mockReset();
    mockThumbnailCacheService.get.mockReset();
    mockThumbnailCacheService.set.mockReset();
    mockThumbnailGenerator.generate.mockReset();

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetAppState();
  });

  it('hydrates cached model thumbnails without invoking the generator', async () => {
    mockProjectService.listDirectory.mockResolvedValue([
      { name: 'crate.glb', path: 'models/crate.glb', kind: 'file' },
    ]);
    mockFileSystemService.readBlob.mockResolvedValue(
      createFile('crate.glb', 'cached-model', 'model/gltf-binary', 42)
    );
    mockThumbnailCacheService.get.mockResolvedValue('data:image/webp;base64,cached');

    const service = new AssetsPreviewService();
    try {
      await vi.waitFor(() => expect(service.getSnapshot().items).toHaveLength(1));

      const [item] = service.getSnapshot().items;
      expect(item.previewType).toBe('model');
      expect(item.thumbnailStatus).toBe('ready');
      expect(item.thumbnailUrl).toBe('data:image/webp;base64,cached');
      expect(mockThumbnailGenerator.generate).not.toHaveBeenCalled();
    } finally {
      service.dispose();
    }
  });

  it('generates and caches missing model thumbnails in the background', async () => {
    mockProjectService.listDirectory.mockResolvedValue([
      { name: 'crate.glb', path: 'models/crate.glb', kind: 'file' },
    ]);

    const file = createFile('crate.glb', 'uncached-model', 'model/gltf-binary', 77);
    mockFileSystemService.readBlob.mockResolvedValue(file);
    mockThumbnailCacheService.get.mockResolvedValue(null);
    mockThumbnailGenerator.generate.mockResolvedValue('data:image/webp;base64,generated');

    const service = new AssetsPreviewService();
    const snapshots: AssetsPreviewSnapshot[] = [];
    const unsubscribe = service.subscribe(snapshot => {
      snapshots.push(snapshot);
    });

    try {
      await vi.waitFor(() => {
        const currentItem = service.getSnapshot().items[0];
        expect(currentItem?.thumbnailStatus).toBe('ready');
      });

      const [item] = service.getSnapshot().items;
      expect(item.thumbnailUrl).toBe('data:image/webp;base64,generated');
      expect(mockThumbnailGenerator.generate).toHaveBeenCalledWith(file, 'models/crate.glb');
      expect(mockThumbnailCacheService.set).toHaveBeenCalledWith(
        expect.stringContaining('models/crate.glb'),
        'data:image/webp;base64,generated'
      );
      expect(snapshots.some(snapshot => snapshot.items[0]?.thumbnailStatus === 'loading')).toBe(
        true
      );
    } finally {
      unsubscribe();
      service.dispose();
    }
  });
});

function createFile(name: string, content: string, type: string, lastModified: number): File {
  return new File([content], name, { type, lastModified });
}
