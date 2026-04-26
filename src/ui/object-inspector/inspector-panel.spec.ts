import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  AmbientLightNode,
  AudioPlayer,
  Camera3D,
  type NodeBase,
  PlaySoundBehavior,
  type PropertyDefinition,
} from '@pix3/runtime';

type DragLike = Pick<DragEvent, 'dataTransfer'>;
let InspectorPanel: typeof import('./inspector-panel').InspectorPanel;

function createDragEvent(resourcePath: string): DragLike {
  const transfer = {
    getData: (type: string): string => {
      if (type === 'application/x-pix3-asset-resource') {
        return resourcePath;
      }
      return '';
    },
  };

  return { dataTransfer: transfer as unknown as DataTransfer };
}

function getAudioTrackProperty(schemaOwner: {
  getPropertySchema: () => { properties: PropertyDefinition[] };
}) {
  const prop = schemaOwner
    .getPropertySchema()
    .properties.find(property => property.name === 'audioTrack');
  expect(prop).toBeDefined();
  return prop as PropertyDefinition;
}

class ModelConsumer {
  static getPropertySchema() {
    return {
      properties: [
        {
          name: 'modelPath',
          type: 'string' as const,
          ui: { editor: 'model-resource' as const },
          getValue: () => '',
          setValue: () => {},
        },
      ],
    };
  }
}

beforeAll(async () => {
  vi.mock('golden-layout', () => ({}));
  ({ InspectorPanel } = await import('./inspector-panel'));
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function createAudioBufferMock(): AudioBuffer {
  const channelA = new Float32Array([0, 0.2, -0.4, 0.8, -0.6, 0.1]);
  const channelB = new Float32Array([0.1, -0.3, 0.5, -0.7, 0.4, -0.2]);

  return {
    duration: 2.4,
    numberOfChannels: 2,
    sampleRate: 44100,
    getChannelData(index: number) {
      return index === 0 ? channelA : channelB;
    },
  } as unknown as AudioBuffer;
}

describe('InspectorPanel audio resource handling', () => {
  it('marks AudioPlayer and PlaySoundBehavior audioTrack with the audio editor', () => {
    const nodeProp = getAudioTrackProperty(AudioPlayer);
    const componentProp = getAudioTrackProperty(PlaySoundBehavior);

    expect(nodeProp.ui?.editor).toBe('audio-resource');
    expect(componentProp.ui?.editor).toBe('audio-resource');
  });

  it('updates AudioPlayer audioTrack from internal audio asset drops and ignores non-audio assets', async () => {
    const panel = new InspectorPanel();
    const execute = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(panel, 'commandDispatcher', {
      value: { execute },
      configurable: true,
    });

    (panel as unknown as { primaryNode: AudioPlayer | null }).primaryNode = new AudioPlayer({
      id: 'audio-player',
      name: 'Audio Player',
    });
    (
      panel as unknown as {
        propertySchema: ReturnType<typeof AudioPlayer.getPropertySchema> | null;
      }
    ).propertySchema = AudioPlayer.getPropertySchema();

    (
      panel as unknown as { onAudioResourceDrop: (propertyName: string, event: DragEvent) => void }
    ).onAudioResourceDrop('audioTrack', createDragEvent('res://assets/sfx/click.wav') as DragEvent);
    await Promise.resolve();

    expect(execute).toHaveBeenCalledTimes(1);
    const objectCommand = execute.mock.calls[0]?.[0] as {
      params?: { propertyPath: string; value: string };
    };
    expect(objectCommand.params?.propertyPath).toBe('audioTrack');
    expect(objectCommand.params?.value).toBe('res://assets/sfx/click.wav');

    execute.mockClear();

    (
      panel as unknown as { onAudioResourceDrop: (propertyName: string, event: DragEvent) => void }
    ).onAudioResourceDrop(
      'audioTrack',
      createDragEvent('res://assets/images/icon.png') as DragEvent
    );
    await Promise.resolve();

    expect(execute).not.toHaveBeenCalled();
  });

  it('updates component audioTrack from internal audio asset drops', async () => {
    const panel = new InspectorPanel();
    const execute = vi.fn().mockResolvedValue(undefined);
    const node = new AudioPlayer({
      id: 'audio-player',
      name: 'Audio Player',
    });
    const component = new PlaySoundBehavior('behavior-1', 'core:PlaySound');
    node.addComponent(component);

    Object.defineProperty(panel, 'commandDispatcher', {
      value: { execute },
      configurable: true,
    });

    (panel as unknown as { primaryNode: AudioPlayer | null }).primaryNode = node;

    const prop = getAudioTrackProperty(PlaySoundBehavior);

    (
      panel as unknown as {
        onComponentAudioResourceDrop: (
          componentId: string,
          prop: PropertyDefinition,
          event: DragEvent
        ) => void;
      }
    ).onComponentAudioResourceDrop(
      component.id,
      prop,
      createDragEvent('res://assets/sfx/ui.ogg') as DragEvent
    );
    await Promise.resolve();

    expect(execute).toHaveBeenCalledTimes(1);
    const componentCommand = execute.mock.calls[0]?.[0] as {
      params?: { componentId: string; propertyName: string; value: string };
    };
    expect(componentCommand.params?.componentId).toBe(component.id);
    expect(componentCommand.params?.propertyName).toBe('audioTrack');
    expect(componentCommand.params?.value).toBe('res://assets/sfx/ui.ogg');
  });
});

describe('InspectorPanel model resource handling', () => {
  it('marks modelPath with the model editor', () => {
    const prop = ModelConsumer.getPropertySchema().properties.find(
      property => property.name === 'modelPath'
    );

    expect(prop).toBeDefined();
    expect(prop?.ui?.editor).toBe('model-resource');
  });

  it('updates node modelPath from internal model asset drops and ignores non-model assets', async () => {
    const panel = new InspectorPanel();
    const execute = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(panel, 'commandDispatcher', {
      value: { execute },
      configurable: true,
    });

    (panel as unknown as { primaryNode: AudioPlayer | null }).primaryNode = new AudioPlayer({
      id: 'audio-player',
      name: 'Audio Player',
    });
    (
      panel as unknown as {
        propertySchema: ReturnType<typeof ModelConsumer.getPropertySchema> | null;
      }
    ).propertySchema = ModelConsumer.getPropertySchema();

    (
      panel as unknown as { onModelResourceDrop: (propertyName: string, event: DragEvent) => void }
    ).onModelResourceDrop(
      'modelPath',
      createDragEvent('res://assets/models/wall.glb') as DragEvent
    );
    await Promise.resolve();

    expect(execute).toHaveBeenCalledTimes(1);
    const objectCommand = execute.mock.calls[0]?.[0] as {
      params?: { propertyPath: string; value: string };
    };
    expect(objectCommand.params?.propertyPath).toBe('modelPath');
    expect(objectCommand.params?.value).toBe('res://assets/models/wall.glb');

    execute.mockClear();

    (
      panel as unknown as { onModelResourceDrop: (propertyName: string, event: DragEvent) => void }
    ).onModelResourceDrop(
      'modelPath',
      createDragEvent('res://assets/audio/click.wav') as DragEvent
    );
    await Promise.resolve();

    expect(execute).not.toHaveBeenCalled();
  });
});

describe('InspectorPanel color property editor', () => {
  it('renders a color picker and a text input for color properties', async () => {
    const node = new AmbientLightNode({
      id: 'ambient-light',
      name: 'Ambient Light',
      color: '#336699',
    });
    const { panel } = await setupInspectorForNode(node);

    const colorInput = panel.querySelector('input[type="color"]') as HTMLInputElement | null;
    const textInput = panel.querySelector(
      '.property-color-editor input[type="text"]'
    ) as HTMLInputElement | null;
    const expectedColor = `#${node.light.color.getHexString()}`;

    expect(colorInput).not.toBeNull();
    expect(textInput).not.toBeNull();
    expect(colorInput?.value).toBe(expectedColor);
    expect(textInput?.value).toBe(expectedColor);
  });

  it('dispatches UpdateObjectPropertyCommand when the color picker changes', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const { panel } = await setupInspectorForNode(
      new AmbientLightNode({
        id: 'ambient-light',
        name: 'Ambient Light',
        color: '#336699',
      }),
      execute
    );

    const colorInput = panel.querySelector('input[type="color"]') as HTMLInputElement;
    colorInput.value = '#ff8800';
    colorInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await Promise.resolve();

    expect(execute).toHaveBeenCalledTimes(1);
    const command = execute.mock.calls[0]?.[0] as {
      params?: { propertyPath: string; value: string };
    };
    expect(command.params?.propertyPath).toBe('color');
    expect(command.params?.value).toBe('#ff8800');
  });

  it('dispatches UpdateObjectPropertyCommand when typing a valid hex color', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const { panel } = await setupInspectorForNode(
      new AmbientLightNode({
        id: 'ambient-light',
        name: 'Ambient Light',
        color: '#336699',
      }),
      execute
    );

    const textInput = panel.querySelector(
      '.property-color-editor input[type="text"]'
    ) as HTMLInputElement;
    textInput.value = '#123abc';
    textInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await Promise.resolve();

    expect(execute).toHaveBeenCalledTimes(1);
    const command = execute.mock.calls[0]?.[0] as {
      params?: { propertyPath: string; value: string };
    };
    expect(command.params?.propertyPath).toBe('color');
    expect(command.params?.value).toBe('#123abc');
  });
});

describe('InspectorPanel camera projection editor', () => {
  it('renders projection select and disables fov for orthographic cameras', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const { panel } = await setupInspectorForNode(
      new Camera3D({
        id: 'camera-ortho',
        name: 'Camera',
        projection: 'orthographic',
        orthographicSize: 6,
      }),
      execute
    );

    const selects = Array.from(
      panel.querySelectorAll('select.property-select')
    ) as HTMLSelectElement[];
    const projectionSelect = selects.find(select =>
      Array.from(select.options).some(option => option.value === 'orthographic')
    );
    const numberInputs = Array.from(
      panel.querySelectorAll('input[type="number"]')
    ) as HTMLInputElement[];
    const fovInput = numberInputs.find(input => input.value === '60');

    expect(projectionSelect).toBeInstanceOf(HTMLSelectElement);
    expect((projectionSelect as HTMLSelectElement).value).toBe('orthographic');
    expect(fovInput).toBeInstanceOf(HTMLInputElement);
    expect((fovInput as HTMLInputElement).disabled).toBe(true);
  });
});

describe('InspectorPanel asset preview rendering', () => {
  it('renders interactive model preview for selected 3D assets', async () => {
    const panel = document.createElement('pix3-inspector-panel') as InstanceType<
      typeof InspectorPanel
    >;

    Object.defineProperty(panel, 'sceneManager', {
      value: { getSceneGraph: vi.fn(() => null), getActiveSceneGraph: vi.fn(() => null) },
      configurable: true,
    });
    Object.defineProperty(panel, 'commandDispatcher', {
      value: { execute: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    Object.defineProperty(panel, 'behaviorPickerService', {
      value: { showPicker: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(panel, 'scriptCreatorService', {
      value: { showCreator: vi.fn(), createScript: vi.fn(), checkIfScriptExists: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(panel, 'scriptRegistry', {
      value: { getComponentPropertySchema: vi.fn(() => null), getComponentType: vi.fn(() => null) },
      configurable: true,
    });
    Object.defineProperty(panel, 'iconService', {
      value: { getIcon: vi.fn(() => 'icon') },
      configurable: true,
    });
    Object.defineProperty(panel, 'dialogService', {
      value: { showConfirmation: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(panel, 'fileSystemAPI', {
      value: { readBlob: vi.fn(), listDirectory: vi.fn(async () => []) },
      configurable: true,
    });
    Object.defineProperty(panel, 'projectStorage', {
      value: { readTextFile: vi.fn(async () => '') },
      configurable: true,
    });
    Object.defineProperty(panel, 'assetsPreviewService', {
      value: {
        requestThumbnail: vi.fn(),
        subscribe: (listener: (snapshot: { selectedItem: unknown }) => void) => {
          listener({
            selectedItem: {
              name: 'crate.glb',
              path: 'assets/models/crate.glb',
              kind: 'file',
              previewType: 'model',
              thumbnailUrl: 'data:image/webp;base64,thumb',
              previewUrl: null,
              thumbnailStatus: 'ready',
              iconName: 'box',
              extension: 'glb',
              sizeBytes: 1024,
              width: null,
              height: null,
              durationSeconds: null,
              channelCount: null,
              sampleRate: null,
              lastModified: 10,
            },
          });
          return () => undefined;
        },
      },
      configurable: true,
    });
    Object.defineProperty(panel, 'viewportService', {
      value: { setPreviewAnimation: vi.fn() },
      configurable: true,
    });

    document.body.appendChild(panel);
    await panel.updateComplete;

    const preview = panel.querySelector('pix3-model-asset-preview');
    expect(preview).not.toBeNull();
    expect(preview?.getAttribute('resourcepath')).toBeNull();
    expect((preview as { resourcePath?: string }).resourcePath).toBe(
      'res://assets/models/crate.glb'
    );
  });

  it('renders playable audio preview for selected audio assets', async () => {
    const panel = document.createElement('pix3-inspector-panel') as InstanceType<
      typeof InspectorPanel
    >;

    Object.defineProperty(panel, 'sceneManager', {
      value: { getSceneGraph: vi.fn(() => null), getActiveSceneGraph: vi.fn(() => null) },
      configurable: true,
    });
    Object.defineProperty(panel, 'commandDispatcher', {
      value: { execute: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    Object.defineProperty(panel, 'behaviorPickerService', {
      value: { showPicker: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(panel, 'scriptCreatorService', {
      value: { showCreator: vi.fn(), createScript: vi.fn(), checkIfScriptExists: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(panel, 'scriptRegistry', {
      value: { getComponentPropertySchema: vi.fn(() => null), getComponentType: vi.fn(() => null) },
      configurable: true,
    });
    Object.defineProperty(panel, 'iconService', {
      value: { getIcon: vi.fn(() => 'icon') },
      configurable: true,
    });
    Object.defineProperty(panel, 'dialogService', {
      value: { showConfirmation: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(panel, 'fileSystemAPI', {
      value: { readBlob: vi.fn(), listDirectory: vi.fn(async () => []) },
      configurable: true,
    });
    Object.defineProperty(panel, 'projectStorage', {
      value: { readTextFile: vi.fn(async () => '') },
      configurable: true,
    });
    Object.defineProperty(panel, 'assetsPreviewService', {
      value: {
        subscribe: (listener: (snapshot: { selectedItem: unknown }) => void) => {
          listener({
            selectedItem: {
              name: 'click.wav',
              path: 'assets/audio/click.wav',
              kind: 'file',
              previewType: 'audio',
              thumbnailUrl: 'data:image/svg+xml;charset=utf-8,waveform',
              previewUrl: 'blob:audio-preview',
              thumbnailStatus: 'ready',
              iconName: 'music',
              extension: 'wav',
              sizeBytes: 2048,
              width: null,
              height: null,
              durationSeconds: 2.4,
              channelCount: 2,
              sampleRate: 44100,
              lastModified: 10,
            },
          });
          return () => undefined;
        },
      },
      configurable: true,
    });
    Object.defineProperty(panel, 'viewportService', {
      value: { setPreviewAnimation: vi.fn() },
      configurable: true,
    });

    document.body.appendChild(panel);
    await panel.updateComplete;

    const preview = panel.querySelector('pix3-audio-resource-editor') as
      | (HTMLElement & {
          updateComplete?: Promise<unknown>;
          shadowRoot: ShadowRoot | null;
          showResourceControls?: boolean;
        })
      | null;
    expect(preview).not.toBeNull();
    expect(preview?.showResourceControls).toBe(false);
    await preview?.updateComplete;
    expect(preview?.shadowRoot?.querySelector('audio')).not.toBeNull();
    expect(preview?.shadowRoot?.querySelector('.waveform')).not.toBeNull();
  });

  it('renders text content for selected text assets', async () => {
    const panel = document.createElement('pix3-inspector-panel') as InstanceType<
      typeof InspectorPanel
    >;
    const readTextFile = vi.fn(async () => 'title: Demo\nmode: editor\nenabled: true');

    Object.defineProperty(panel, 'sceneManager', {
      value: { getSceneGraph: vi.fn(() => null), getActiveSceneGraph: vi.fn(() => null) },
      configurable: true,
    });
    Object.defineProperty(panel, 'commandDispatcher', {
      value: { execute: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    Object.defineProperty(panel, 'behaviorPickerService', {
      value: { showPicker: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(panel, 'scriptCreatorService', {
      value: { showCreator: vi.fn(), createScript: vi.fn(), checkIfScriptExists: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(panel, 'scriptRegistry', {
      value: { getComponentPropertySchema: vi.fn(() => null), getComponentType: vi.fn(() => null) },
      configurable: true,
    });
    Object.defineProperty(panel, 'iconService', {
      value: { getIcon: vi.fn(() => 'icon') },
      configurable: true,
    });
    Object.defineProperty(panel, 'dialogService', {
      value: { showConfirmation: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(panel, 'fileSystemAPI', {
      value: { readBlob: vi.fn(), listDirectory: vi.fn(async () => []) },
      configurable: true,
    });
    Object.defineProperty(panel, 'projectStorage', {
      value: { readTextFile },
      configurable: true,
    });
    Object.defineProperty(panel, 'assetsPreviewService', {
      value: {
        subscribe: (listener: (snapshot: { selectedItem: unknown }) => void) => {
          listener({
            selectedItem: {
              name: 'config.yaml',
              path: 'assets/config.yaml',
              kind: 'file',
              previewType: 'text',
              thumbnailUrl: null,
              previewUrl: null,
              previewText: 'title: Demo',
              thumbnailStatus: 'ready',
              iconName: 'file-text',
              extension: 'yaml',
              sizeBytes: 120,
              width: null,
              height: null,
              durationSeconds: null,
              channelCount: null,
              sampleRate: null,
              lastModified: 10,
            },
          });
          return () => undefined;
        },
      },
      configurable: true,
    });
    Object.defineProperty(panel, 'viewportService', {
      value: { setPreviewAnimation: vi.fn() },
      configurable: true,
    });

    document.body.appendChild(panel);
    await panel.updateComplete;

    await vi.waitFor(() => {
      const textPreview = panel.querySelector('.asset-text-preview');
      expect(textPreview?.textContent).toContain('mode: editor');
      expect(textPreview?.textContent).toContain('enabled: true');
    });

    expect(readTextFile).toHaveBeenCalledWith('assets/config.yaml');
  });

  it('loads playable audio previews for object inspector audio properties', async () => {
    const decodeAudioData = vi.fn().mockResolvedValue(createAudioBufferMock());
    vi.stubGlobal(
      'AudioContext',
      class {
        decodeAudioData = decodeAudioData;
      } as unknown as typeof AudioContext
    );
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:loaded-audio'),
      revokeObjectURL: vi.fn(),
    });

    const panel = document.createElement('pix3-inspector-panel') as InstanceType<
      typeof InspectorPanel
    >;
    const readBlob = vi.fn().mockResolvedValue(new File(['audio-data'], 'click.wav', { type: 'audio/wav' }));
    const node = new AudioPlayer({
      id: 'audio-player',
      name: 'Audio Player',
      audioTrack: 'res://assets/sfx/click.wav',
    });

    Object.defineProperty(panel, 'fileSystemAPI', {
      value: { readBlob, listDirectory: vi.fn(async () => []) },
      configurable: true,
    });
    Object.defineProperty(panel, 'sceneManager', {
      value: { getSceneGraph: vi.fn(() => null), getActiveSceneGraph: vi.fn(() => null) },
      configurable: true,
    });
    Object.defineProperty(panel, 'commandDispatcher', {
      value: { execute: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    Object.defineProperty(panel, 'behaviorPickerService', {
      value: { showPicker: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(panel, 'scriptCreatorService', {
      value: { showCreator: vi.fn(), createScript: vi.fn(), checkIfScriptExists: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(panel, 'scriptRegistry', {
      value: { getComponentPropertySchema: vi.fn(() => null), getComponentType: vi.fn(() => null) },
      configurable: true,
    });
    Object.defineProperty(panel, 'iconService', {
      value: { getIcon: vi.fn(() => 'icon') },
      configurable: true,
    });
    Object.defineProperty(panel, 'dialogService', {
      value: { showConfirmation: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(panel, 'assetsPreviewService', {
      value: {
        subscribe: (listener: (snapshot: { selectedItem: null }) => void) => {
          listener({ selectedItem: null });
          return () => undefined;
        },
      },
      configurable: true,
    });
    Object.defineProperty(panel, 'viewportService', {
      value: { setPreviewAnimation: vi.fn() },
      configurable: true,
    });

    document.body.appendChild(panel);
    (
      panel as unknown as {
        selectedNodes: NodeBase[];
        primaryNode: NodeBase;
        syncValuesFromNode: () => void;
      }
    ).selectedNodes = [node];
    (panel as unknown as { primaryNode: NodeBase }).primaryNode = node;
    (
      panel as unknown as {
        syncValuesFromNode: () => void;
      }
    ).syncValuesFromNode();

    panel.requestUpdate();
    await panel.updateComplete;

    await vi.waitFor(async () => {
      const preview = panel.querySelector('pix3-audio-resource-editor') as
        | (HTMLElement & { updateComplete?: Promise<unknown>; shadowRoot: ShadowRoot | null })
        | null;
      await preview?.updateComplete;
      expect(preview?.shadowRoot?.querySelector('audio')).not.toBeNull();
      expect(preview?.shadowRoot?.querySelector('.waveform')).not.toBeNull();
    });

    expect(readBlob).toHaveBeenCalledWith('res://assets/sfx/click.wav');
    expect(decodeAudioData).toHaveBeenCalledOnce();
  });
});

async function setupInspectorForNode(
  node: NodeBase,
  execute = vi.fn().mockResolvedValue(undefined)
): Promise<{ panel: InstanceType<typeof InspectorPanel>; execute: typeof execute }> {
  const panel = document.createElement('pix3-inspector-panel') as InstanceType<
    typeof InspectorPanel
  >;

  Object.defineProperty(panel, 'sceneManager', {
    value: { getSceneGraph: vi.fn(() => null), getActiveSceneGraph: vi.fn(() => null) },
    configurable: true,
  });
  Object.defineProperty(panel, 'commandDispatcher', {
    value: { execute },
    configurable: true,
  });
  Object.defineProperty(panel, 'behaviorPickerService', {
    value: { showPicker: vi.fn() },
    configurable: true,
  });
  Object.defineProperty(panel, 'scriptCreatorService', {
    value: { showCreator: vi.fn(), createScript: vi.fn(), checkIfScriptExists: vi.fn() },
    configurable: true,
  });
  Object.defineProperty(panel, 'scriptRegistry', {
    value: { getComponentPropertySchema: vi.fn(() => null), getComponentType: vi.fn(() => null) },
    configurable: true,
  });
  Object.defineProperty(panel, 'iconService', {
    value: { getIcon: vi.fn(() => 'icon') },
    configurable: true,
  });
  Object.defineProperty(panel, 'dialogService', {
    value: { showConfirmation: vi.fn() },
    configurable: true,
  });
  Object.defineProperty(panel, 'fileSystemAPI', {
    value: { readBlob: vi.fn(), listDirectory: vi.fn(async () => []) },
    configurable: true,
  });
  Object.defineProperty(panel, 'projectStorage', {
    value: { readTextFile: vi.fn(async () => '') },
    configurable: true,
  });
  Object.defineProperty(panel, 'assetsPreviewService', {
    value: {
      subscribe: (listener: (snapshot: { selectedItem: null }) => void) => {
        listener({ selectedItem: null });
        return () => undefined;
      },
    },
    configurable: true,
  });
  Object.defineProperty(panel, 'viewportService', {
    value: { setPreviewAnimation: vi.fn() },
    configurable: true,
  });

  document.body.appendChild(panel);

  (
    panel as unknown as {
      selectedNodes: NodeBase[];
      primaryNode: NodeBase;
      syncValuesFromNode: () => void;
    }
  ).selectedNodes = [node];
  (panel as unknown as { primaryNode: NodeBase }).primaryNode = node;
  (
    panel as unknown as {
      syncValuesFromNode: () => void;
    }
  ).syncValuesFromNode();

  panel.requestUpdate();
  await panel.updateComplete;

  return { panel, execute };
}
