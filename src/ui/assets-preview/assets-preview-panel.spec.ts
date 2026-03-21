import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AssetPreviewItem, AssetsPreviewSnapshot } from '@/services/AssetsPreviewService';
import type { AssetFileActivationService, AssetsPreviewService, IconService } from '@/services';

vi.mock('@/services', () => ({
  AssetFileActivationService: class AssetFileActivationService {},
  AssetsPreviewService: class AssetsPreviewService {},
  IconService: class IconService {},
}));

const { AssetsPreviewPanel } = await import('./assets-preview-panel');

const createSnapshot = (items: AssetPreviewItem[]): AssetsPreviewSnapshot => ({
  selectedFolderPath: '.',
  displayPath: 'res://',
  isLoading: false,
  errorMessage: null,
  selectedItemPath: null,
  selectedItem: null,
  items,
});

describe('AssetsPreviewPanel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders inline file size for files', async () => {
    const panel = document.createElement('pix3-assets-preview-panel') as AssetsPreviewPanel;
    stubPanelServices(
      panel,
      createSnapshot([
        createItem({
          name: 'sprite.png',
          path: 'assets/sprite.png',
          kind: 'file',
          sizeBytes: 1536,
        }),
      ])
    );

    document.body.appendChild(panel);
    await panel.updateComplete;

    const meta = panel.querySelector('.meta');
    expect(meta?.textContent?.trim()).toBe('1.5 KB');
  });

  it('does not render inline file size for directories', async () => {
    const panel = document.createElement('pix3-assets-preview-panel') as AssetsPreviewPanel;
    stubPanelServices(
      panel,
      createSnapshot([
        createItem({
          name: 'textures',
          path: 'assets/textures',
          kind: 'directory',
          sizeBytes: null,
        }),
      ])
    );

    document.body.appendChild(panel);
    await panel.updateComplete;

    expect(panel.querySelector('.meta')).toBeNull();
  });

  it('formats bytes, KB, and MB consistently', () => {
    const panel = new AssetsPreviewPanel();
    const formatFileSize = (
      panel as unknown as {
        formatFileSize: (sizeBytes: number) => string;
      }
    ).formatFileSize.bind(panel);

    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3.00 MB');
  });
});

function stubPanelServices(panel: AssetsPreviewPanel, snapshot: AssetsPreviewSnapshot): void {
  const assetsPreviewService: Pick<AssetsPreviewService, 'subscribe' | 'selectItem'> = {
    subscribe(listener: (value: AssetsPreviewSnapshot) => void) {
      listener(snapshot);
      return () => undefined;
    },
    selectItem: vi.fn(),
  };

  const assetFileActivationService: Pick<AssetFileActivationService, 'handleActivation'> = {
    handleActivation: vi.fn(async () => undefined),
  };

  const iconService: Pick<IconService, 'getIcon'> = {
    getIcon: vi.fn(() => 'icon' as unknown as ReturnType<IconService['getIcon']>),
  };

  Object.defineProperty(panel, 'assetsPreviewService', {
    value: assetsPreviewService,
    configurable: true,
  });
  Object.defineProperty(panel, 'assetFileActivationService', {
    value: assetFileActivationService,
    configurable: true,
  });
  Object.defineProperty(panel, 'iconService', {
    value: iconService,
    configurable: true,
  });
}

function createItem(
  overrides: Partial<AssetPreviewItem> & Pick<AssetPreviewItem, 'name' | 'path' | 'kind'>
): AssetPreviewItem {
  return {
    name: overrides.name,
    path: overrides.path,
    kind: overrides.kind,
    previewType: overrides.previewType ?? 'icon',
    thumbnailUrl: overrides.thumbnailUrl ?? null,
    iconName: overrides.iconName ?? 'file',
    extension: overrides.extension ?? '',
    sizeBytes: overrides.sizeBytes ?? null,
    width: overrides.width ?? null,
    height: overrides.height ?? null,
  };
}
