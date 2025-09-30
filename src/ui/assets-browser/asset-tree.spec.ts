import { describe, expect, it, vi } from 'vitest';

import { AssetTree } from './asset-tree';

type AssetTreeNode = {
  name: string;
  path: string;
  kind: FileSystemHandleKind;
  children?: AssetTreeNode[] | null;
  expanded?: boolean;
  editing?: boolean;
};

describe('AssetTree scene activation', () => {
  const callLoadSceneFromNode = async (tree: AssetTree, node: AssetTreeNode) => {
    return await (tree as unknown as { loadSceneFromNode(node: AssetTreeNode): Promise<void> }).loadSceneFromNode.call(
      tree,
      node
    );
  };

  const activateNode = (tree: AssetTree, node: AssetTreeNode) => {
    (tree as unknown as { onNodeActivate(event: MouseEvent, node: AssetTreeNode): void }).onNodeActivate.call(
      tree,
      new MouseEvent('dblclick', { bubbles: true, composed: true }),
      node
    );
  };

  it('invokes LoadSceneCommand and emits scene-loaded event for pix3scene assets', async () => {
    const tree = new AssetTree();
    const execute = vi.fn().mockResolvedValue({});
    Object.defineProperty(tree, 'loadSceneCommand', {
      value: { execute },
      configurable: true,
    });

    const node: AssetTreeNode = {
      name: 'Level.pix3scene',
      path: 'scenes/Level.pix3scene',
      kind: 'file',
    };

    const eventPromise = new Promise<CustomEvent>(resolve => {
      tree.addEventListener('pix3-scene-loaded', event => resolve(event as CustomEvent));
    });

    await callLoadSceneFromNode(tree, node);
    const dispatched = await eventPromise;

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({
      filePath: 'res://scenes/Level.pix3scene',
      sceneId: 'scenes-level',
    });
    expect(dispatched.detail).toEqual({
      filePath: 'res://scenes/Level.pix3scene',
      sceneId: 'scenes-level',
    });
  });

  it('emits load error event when LoadSceneCommand rejects', async () => {
    const tree = new AssetTree();
    const failure = new Error('Failed to load scene');
    const execute = vi.fn().mockRejectedValue(failure);
    Object.defineProperty(tree, 'loadSceneCommand', {
      value: { execute },
      configurable: true,
    });

    const node: AssetTreeNode = {
      name: 'Crash.pix3scene',
      path: 'levels/Crash.pix3scene',
      kind: 'file',
    };

    const eventPromise = new Promise<CustomEvent>(resolve => {
      tree.addEventListener('pix3-scene-load-error', event => resolve(event as CustomEvent));
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await callLoadSceneFromNode(tree, node);
    const dispatched = await eventPromise;

    expect(execute).toHaveBeenCalledTimes(1);
    expect(dispatched.detail.filePath).toBe('res://levels/Crash.pix3scene');
    expect(dispatched.detail.sceneId).toBe('levels-crash');
    expect(dispatched.detail.error).toBe(failure);

    consoleSpy.mockRestore();
  });

  it('ignores non scene files on activation', async () => {
    const tree = new AssetTree();
    const execute = vi.fn().mockResolvedValue({});
    Object.defineProperty(tree, 'loadSceneCommand', {
      value: { execute },
      configurable: true,
    });

    const node: AssetTreeNode = {
      name: 'notes.txt',
      path: 'docs/notes.txt',
      kind: 'file',
    };

    activateNode(tree, node);
    await Promise.resolve();

    expect(execute).not.toHaveBeenCalled();
  });
});
