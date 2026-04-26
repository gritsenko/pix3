import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetAppState } from '@/state';
import type { FileDescriptor } from '@/services';

const { AssetTree } = await import('./asset-tree');

type AssetTreeElement = HTMLElementTagNameMap['pix3-asset-tree'];

describe('AssetTree', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    resetAppState();
    vi.restoreAllMocks();
  });

  it('renders file sizes and folder content sizes instead of kind labels', async () => {
    const tree = document.createElement('pix3-asset-tree') as AssetTreeElement;
    stubTreeServices(tree, {
      '.': [
        { name: 'textures', path: 'textures', kind: 'directory', size: 0 },
        { name: 'hero.png', path: 'hero.png', kind: 'file', size: 1536 },
      ],
      textures: [
        { name: 'diffuse.png', path: 'textures/diffuse.png', kind: 'file', size: 1024 },
        { name: 'ui', path: 'textures/ui', kind: 'directory', size: 0 },
      ],
      'textures/ui': [
        { name: 'button.png', path: 'textures/ui/button.png', kind: 'file', size: 2048 },
      ],
    });

    document.body.appendChild(tree);
    await vi.waitFor(() => {
      expect(Array.from(tree.querySelectorAll('.node-row'))).toHaveLength(2);
    });

    const rows = Array.from(tree.querySelectorAll('.node-row'));
    expect(rows[0].querySelector('.node-name')?.textContent?.trim()).toBe('textures');
    expect(rows[0].querySelector('.node-meta')?.textContent?.trim()).toBe('3.0 KB');
    expect(rows[1].querySelector('.node-name')?.textContent?.trim()).toBe('hero.png');
    expect(rows[1].querySelector('.node-meta')?.textContent?.trim()).toBe('1.5 KB');
    expect(tree.querySelector('.node-meta')?.textContent).not.toContain('directory');
  });

  it('formats byte values consistently', () => {
    const tree = new AssetTree();
    const formatFileSize = (
      tree as unknown as {
        formatFileSize: (sizeBytes: number) => string;
      }
    ).formatFileSize.bind(tree);

    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3.00 MB');
  });
});

function stubTreeServices(
  tree: AssetTreeElement,
  directories: Record<string, FileDescriptor[]>
): void {
  const projectService = {
    listDirectory: vi.fn(async (path = '.') => directories[path] ?? []),
    saveAssetBrowserState: vi.fn(),
    loadAssetBrowserState: vi.fn(() => null),
  };

  const templateService = {
    getSceneTemplate: vi.fn(() => ''),
  };

  const dialogService = {
    showConfirmation: vi.fn(async () => false),
  };

  const iconService = {
    getIcon: vi.fn(() => 'icon'),
  };

  const assetsPreviewService = {
    syncFromAssetSelection: vi.fn(async () => undefined),
  };

  Object.defineProperty(tree, 'projectService', {
    value: projectService,
    configurable: true,
  });
  Object.defineProperty(tree, 'templateService', {
    value: templateService,
    configurable: true,
  });
  Object.defineProperty(tree, 'dialogService', {
    value: dialogService,
    configurable: true,
  });
  Object.defineProperty(tree, 'iconService', {
    value: iconService,
    configurable: true,
  });
  Object.defineProperty(tree, 'assetsPreviewService', {
    value: assetsPreviewService,
    configurable: true,
  });
}