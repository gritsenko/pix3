import { describe, expect, it } from 'vitest';
import { proxy, snapshot } from 'valtio/vanilla';

import { ApplyLayoutPresetCommand } from './ApplyLayoutPresetCommand';
import { createCommandContext } from '../command';
import { createInitialAppState, type AppState, type PanelVisibilityState } from '../../../state';

describe('ApplyLayoutPresetCommand', () => {
  const defaultVisibility: PanelVisibilityState = {
    sceneTree: true,
    viewport: true,
    inspector: true,
    assetBrowser: true,
  };

  it('updates persona and layout state when applying a new preset', () => {
    const state = proxy<AppState>(createInitialAppState());
    state.ui.persona = 'technical-artist';
    state.ui.layoutPresetId = 'technical-artist';
    state.ui.isLayoutReady = false;
    state.ui.panelVisibility = {
      sceneTree: false,
      viewport: true,
      inspector: false,
      assetBrowser: false,
    };

    const command = new ApplyLayoutPresetCommand({
      persona: 'gameplay-engineer',
      panelVisibility: defaultVisibility,
    });
    const context = createCommandContext(state, snapshot(state));

    const result = command.execute(context);

    expect(result.didMutate).toBe(true);
    expect(state.ui.persona).toBe('gameplay-engineer');
    expect(state.ui.layoutPresetId).toBe('gameplay-engineer');
    expect(state.ui.isLayoutReady).toBe(true);
    expect(state.ui.focusedPanelId).toBe('viewport');
    expect(state.ui.panelVisibility).toEqual(defaultVisibility);

    const undoPayload = command.postCommit(context, result.payload);
    expect(undoPayload.previousPersona).toBe('technical-artist');
  });

  it('does not mutate state when preset already applied and visibility unchanged', () => {
    const state = proxy<AppState>(createInitialAppState());
    state.ui.persona = 'technical-artist';
    state.ui.layoutPresetId = 'technical-artist';
    state.ui.isLayoutReady = true;
    state.ui.panelVisibility = { ...defaultVisibility };

    const command = new ApplyLayoutPresetCommand({
      persona: 'technical-artist',
      panelVisibility: defaultVisibility,
    });
    const context = createCommandContext(state, snapshot(state));

    const result = command.execute(context);

    expect(result.didMutate).toBe(false);
    expect(state.ui.persona).toBe('technical-artist');
  });
});
