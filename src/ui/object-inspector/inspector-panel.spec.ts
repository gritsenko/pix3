import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AudioPlayer, PlaySoundBehavior, type PropertyDefinition } from '@pix3/runtime';

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
