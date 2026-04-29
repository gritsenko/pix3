import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appState, resetAppState } from '@/state';
import { AnimatedSprite2D } from '@pix3/runtime';

import { AnimationPanel } from './animation-panel';

function createAnimatedSprite(nodeId: string, animationResourcePath: string, currentClip = 'idle') {
  const sprite = Object.create(AnimatedSprite2D.prototype) as AnimatedSprite2D;
  Object.defineProperty(sprite, 'nodeId', {
    value: nodeId,
    configurable: true,
  });
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
    const panelState = panel as unknown as {
      activeClipName: string;
      assetPath: string | null;
    };
    const tabId = 'animation:res://animations/walk.pix3anim';
    const animationId = 'animations-walk';

    Object.defineProperty(panel, 'sceneManager', {
      value: {
        getActiveSceneGraph: () => ({
          nodeMap: new Map(),
        }),
      },
    });
    Object.defineProperty(panel, 'projectStorage', {
      value: {
        readBlob: vi.fn(),
      },
    });

    appState.animations.descriptors[animationId] = {
      id: animationId,
      filePath: 'res://animations/walk.pix3anim',
      name: 'walk.pix3anim',
      version: '1.0.0',
      isDirty: false,
      lastSavedAt: null,
      lastModifiedTime: null,
    };
    appState.animations.resources[animationId] = {
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
    };

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
      expect(panelState.activeClipName).toBe('idle');
    });

    expect(panelState.assetPath).toBe('res://animations/walk.pix3anim');
  });

  it('preserves the active clip when reloading the same asset', async () => {
    const panel = new AnimationPanel();
    const panelState = panel as unknown as {
      activeClipName: string;
      syncFromDocumentState: (preserveClip: boolean) => Promise<void>;
    };
    const selectedSprite = createAnimatedSprite('sprite-1', 'res://animations/walk.pix3anim', 'idle');
    const animationId = 'animations-walk';

    Object.defineProperty(panel, 'sceneManager', {
      value: {
        getActiveSceneGraph: () => ({
          nodeMap: new Map([[selectedSprite.nodeId, selectedSprite]]),
        }),
      },
    });
    Object.defineProperty(panel, 'projectStorage', {
      value: {
        readBlob: vi.fn(),
      },
    });
    Object.defineProperty(panel, 'assetPath', {
      value: 'res://animations/walk.pix3anim',
      writable: true,
    });
    Object.defineProperty(panel, 'animationId', {
      value: animationId,
      writable: true,
    });
    Object.defineProperty(panel, 'activeClipName', {
      value: 'run',
      writable: true,
    });

    appState.animations.descriptors[animationId] = {
      id: animationId,
      filePath: 'res://animations/walk.pix3anim',
      name: 'walk.pix3anim',
      version: '1.0.0',
      isDirty: false,
      lastSavedAt: null,
      lastModifiedTime: null,
    };
    appState.animations.resources[animationId] = {
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
    };

    await panelState.syncFromDocumentState(true);

    expect(panelState.activeClipName).toBe('run');
  });

  it('accepts texture drops from the asset browser', async () => {
    const panel = new AnimationPanel();
    const panelState = panel as unknown as {
      onTextureDrop: (event: DragEvent) => Promise<void>;
    };
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

    await panelState.onTextureDrop(event);

    expect(updateTexturePath).toHaveBeenCalledWith('res://textures/player.png');
  });

  it('prompts for autoslice when a texture is assigned to an animation without frames', async () => {
    const panel = new AnimationPanel();
    const panelState = panel as unknown as {
      onUpdateTexturePath: (texturePath: string) => Promise<void>;
    };
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

    await panelState.onUpdateTexturePath('res://textures/player.png');

    expect(showDialog).toHaveBeenCalledWith({
      texturePath: 'res://textures/player.png',
      clipName: 'idle',
      defaultColumns: 1,
      defaultRows: 1,
    });
    expect(addFramesFromGrid).toHaveBeenCalledWith(4, 2);
  });
});