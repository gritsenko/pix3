import { beforeEach, describe, expect, it } from 'vitest';

import { SelectObjectCommand } from './SelectObjectCommand';
import { appState, getAppStateSnapshot, resetAppState } from '../../state';
import { createCommandContext } from './command';

const buildContext = () => createCommandContext(appState, getAppStateSnapshot());

describe('SelectObjectCommand', () => {
  beforeEach(() => {
    resetAppState();
  });

  it('replaces selection when additive flag is not set', () => {
    const command = new SelectObjectCommand({ nodeId: 'demo-box' });
    const result = command.execute(buildContext());

    expect(result.didMutate).toBe(true);
    expect(appState.selection.nodeIds).toEqual(['demo-box']);
    expect(appState.selection.primaryNodeId).toBe('demo-box');
  });

  it('toggles node selection when additive flag is set', () => {
    // Seed selection
    appState.selection.nodeIds = ['environment-root'];
    appState.selection.primaryNodeId = 'environment-root';

    const addCommand = new SelectObjectCommand({ nodeId: 'demo-box', additive: true });
    addCommand.execute(buildContext());
    expect(appState.selection.nodeIds.sort()).toEqual(['demo-box', 'environment-root'].sort());

    const removeCommand = new SelectObjectCommand({ nodeId: 'environment-root', additive: true });
    removeCommand.execute(buildContext());
    expect(appState.selection.nodeIds).toEqual(['demo-box']);
    expect(appState.selection.primaryNodeId).toBe('demo-box');
  });

  it('selects range between primary and target when range flag is set', () => {
    // Flattened order based on SAMPLE_SCENE_HIERARCHY in AppState.ts
    appState.selection.nodeIds = ['environment-root'];
    appState.selection.primaryNodeId = 'environment-root';

    const rangeCommand = new SelectObjectCommand({ nodeId: 'logo-sprite', range: true });
    rangeCommand.execute(buildContext());

    // Expect all nodes from root down to logo sprite to be selected
    expect(appState.selection.nodeIds).toEqual([
      'environment-root',
      'main-camera',
      'key-light',
      'demo-box',
      'ui-layer',
      'logo-sprite',
    ]);
    expect(appState.selection.primaryNodeId).toBe('environment-root');
  });
});
