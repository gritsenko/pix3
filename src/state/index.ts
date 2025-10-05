import { proxy, snapshot, type Snapshot } from 'valtio/vanilla';

import type { AppState } from './AppState';
import { createInitialAppState } from './AppState';

export const appState = proxy<AppState>(createInitialAppState());

export type AppStateSnapshot = Snapshot<AppState>;

export const getAppStateSnapshot = (): AppStateSnapshot => snapshot(appState);

/**
 * Clears the application state back to its default snapshot. Use sparingly—ideally
 * only from bootstrapping flows or test fixtures—so that commands remain the
 * primary mutation mechanism in production code.
 */
export const resetAppState = (): void => {
  const defaults = createInitialAppState();
  appState.project = defaults.project;
  appState.scenes = defaults.scenes;
  appState.selection = defaults.selection;
  appState.ui = defaults.ui;
  appState.operations = defaults.operations;
  appState.telemetry = defaults.telemetry;
};

export {
  DEFAULT_THEME,
  THEME_IDS,
  createInitialAppState,
} from './AppState';

export type {
  AppState,
  OperationState,
  PanelVisibilityState,
  ProjectState,
  ProjectStatus,
  SceneDescriptor,
  SceneHierarchyState,
  SceneLoadState,
  ScenesState,
  SelectionState,
  TelemetryState,
  ThemeName,
  UIState,
} from './AppState';
