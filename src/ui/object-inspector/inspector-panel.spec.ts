import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  AmbientLightNode,
  AudioPlayer,
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

beforeAll(async () => {
  vi.mock('golden-layout', () => ({}));
  ({ InspectorPanel } = await import('./inspector-panel'));
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

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

async function setupInspectorForNode(
  node: AmbientLightNode,
  execute = vi.fn().mockResolvedValue(undefined)
): Promise<{ panel: InstanceType<typeof InspectorPanel>; execute: typeof execute }> {
  const panel = document.createElement('pix3-inspector-panel') as InstanceType<typeof InspectorPanel>;

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
  Object.defineProperty(panel, 'assetsPreviewService', {
    value: { subscribe: (listener: (snapshot: { selectedItem: null }) => void) => {
      listener({ selectedItem: null });
      return () => undefined;
    } },
    configurable: true,
  });
  Object.defineProperty(panel, 'viewportService', {
    value: { setPreviewAnimation: vi.fn() },
    configurable: true,
  });

  document.body.appendChild(panel);

  (
    panel as unknown as {
      selectedNodes: AmbientLightNode[];
      primaryNode: AmbientLightNode;
      syncValuesFromNode: () => void;
    }
  ).selectedNodes = [node];
  (panel as unknown as { primaryNode: AmbientLightNode }).primaryNode = node;
  (
    panel as unknown as {
      syncValuesFromNode: () => void;
    }
  ).syncValuesFromNode();

  panel.requestUpdate();
  await panel.updateComplete;

  return { panel, execute };
}
