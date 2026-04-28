import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appState, resetAppState } from '@/state';
import { AnimatedSprite2D } from '@pix3/runtime';

import { AnimationPanel } from './animation-panel';

function createAnimatedSprite(nodeId: string, animationResourcePath: string, currentClip = 'idle') {
  const sprite = Object.create(AnimatedSprite2D.prototype) as AnimatedSprite2D;
  sprite.nodeId = nodeId;
  sprite.animationResourcePath = animationResourcePath;
  sprite.currentClip = currentClip;
  return sprite;
}

describe('AnimationPanel', () => {
  beforeEach(() => {
    resetAppState();
  });

  afterEach(() => {
    resetAppState();
    document.body.innerHTML = '';
  });

  it('loads an animation asset from the assigned editor tab', async () => {
    const panel = new AnimationPanel();
    const readTextFile = vi.fn().mockResolvedValue(
      JSON.stringify({
        version: '1.0.0',
        texturePath: '',
        clips: [
          {
            name: 'idle',
            fps: 12,
            loop: true,
            frames: [],
          },
        ],
      })
    );
    const tabId = 'animation:res://animations/walk.pix3anim';

    Object.defineProperty(panel, 'sceneManager', {
      value: {
        getActiveSceneGraph: () => ({
          nodeMap: new Map(),
        }),
      },
    });
    Object.defineProperty(panel, 'projectStorage', {
      value: {
        readTextFile,
        readBlob: vi.fn(),
      },
    });

    appState.tabs.tabs = [
      {
        id: tabId,
        resourceId: 'res://animations/walk.pix3anim',
        type: 'animation',
        title: 'walk.pix3anim',
        isDirty: false,
      },
    ];
    panel.tabId = tabId;

    document.body.appendChild(panel);

    await vi.waitFor(() => {
      expect(readTextFile).toHaveBeenCalledWith('res://animations/walk.pix3anim');
    });

    await vi.waitFor(() => {
      expect((panel as AnimationPanel & { activeClipName: string }).activeClipName).toBe('idle');
    });

    expect((panel as AnimationPanel & { assetPath: string | null }).assetPath).toBe(
      'res://animations/walk.pix3anim'
    );
  });

  it('preserves the active clip when reloading the same asset', async () => {
    const panel = new AnimationPanel();
    const selectedSprite = createAnimatedSprite('sprite-1', 'res://animations/walk.pix3anim', 'idle');
    const readTextFile = vi.fn().mockResolvedValue(
      JSON.stringify({
        version: '1.0.0',
        texturePath: '',
        clips: [
          {
            name: 'idle',
            fps: 12,
            loop: true,
            frames: [],
          },
          {
            name: 'run',
            fps: 16,
            loop: true,
            frames: [],
          },
        ],
      })
    );

    Object.defineProperty(panel, 'sceneManager', {
      value: {
        getActiveSceneGraph: () => ({
          nodeMap: new Map([[selectedSprite.nodeId, selectedSprite]]),
        }),
      },
    });
    Object.defineProperty(panel, 'projectStorage', {
      value: {
        readTextFile,
        readBlob: vi.fn(),
      },
    });
    Object.defineProperty(panel, 'activeClipName', {
      value: 'run',
      writable: true,
    });

    await (panel as AnimationPanel & {
      loadResource: (assetPath: string | null, preserveClip: boolean) => Promise<void>;
    }).loadResource('res://animations/walk.pix3anim', true);

    expect((panel as AnimationPanel & { activeClipName: string }).activeClipName).toBe('run');
  });

  it('accepts texture drops from the asset browser', async () => {
    const panel = new AnimationPanel();
    const updateTexturePath = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(panel, 'onUpdateTexturePath', {
      value: updateTexturePath,
    });

    const event = {
      preventDefault: vi.fn(),
      dataTransfer: {
        getData: vi.fn((type: string) =>
          type === 'application/x-pix3-asset-resource' ? 'res://textures/player.png' : ''
        ),
      },
    } as unknown as DragEvent;

    await (panel as AnimationPanel & { onTextureDrop: (event: DragEvent) => Promise<void> }).onTextureDrop(event);

    expect(updateTexturePath).toHaveBeenCalledWith('res://textures/player.png');
  });

  it('prompts for autoslice when a texture is assigned to an animation without frames', async () => {
    const panel = new AnimationPanel();
    const showDialog = vi.fn().mockResolvedValue({ columns: 4, rows: 2 });
    const applyResourceUpdate = vi.fn().mockResolvedValue(true);
    const addFramesFromGrid = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(panel, 'animationAutoSliceDialogService', {
      value: { showDialog },
    });
    Object.defineProperty(panel, 'applyResourceUpdate', {
      value: applyResourceUpdate,
    });
    Object.defineProperty(panel, 'onAddFramesFromGrid', {
      value: addFramesFromGrid,
    });
    Object.defineProperty(panel, 'resource', {
      value: {
        version: '1.0.0',
        texturePath: '',
        clips: [
          {
            name: 'idle',
            fps: 12,
            loop: true,
            frames: [],
          },
        ],
      },
      writable: true,
    });
    Object.defineProperty(panel, 'activeClipName', {
      value: 'idle',
      writable: true,
    });

    await (panel as AnimationPanel & { onUpdateTexturePath: (texturePath: string) => Promise<void> }).onUpdateTexturePath(
      'res://textures/player.png'
    );

    expect(showDialog).toHaveBeenCalledWith({
      texturePath: 'res://textures/player.png',
      clipName: 'idle',
      defaultColumns: 1,
      defaultRows: 1,
    });
    expect(addFramesFromGrid).toHaveBeenCalledWith(4, 2);
  });
});