import { beforeEach, describe, expect, it } from 'vitest';

import {
	DEFAULT_PERSONA,
	DEFAULT_THEME,
	createInitialAppState,
} from './AppState';

describe('AppState', () => {
	let initialState: ReturnType<typeof createInitialAppState>;

	beforeEach(() => {
		initialState = createInitialAppState();
	});

	it('provides default values for project, scenes, and ui slices', () => {
		expect(initialState.project.status).toBe('idle');
		expect(initialState.project.directoryHandle).toBeNull();
		expect(initialState.project.recentProjects).toEqual([]);
		expect(initialState.scenes.activeSceneId).toBeNull();
		expect(initialState.scenes.descriptors).toEqual({});
		expect(initialState.ui.persona).toBe(DEFAULT_PERSONA);
		expect(initialState.ui.theme).toBe(DEFAULT_THEME);
		expect(initialState.ui.panelVisibility).toEqual({
			sceneTree: true,
			viewport: true,
			inspector: true,
			assetBrowser: true,
		});
	});

	it('creates a valid AppState structure', () => {
		expect(initialState).toHaveProperty('project');
		expect(initialState).toHaveProperty('scenes');
		expect(initialState).toHaveProperty('selection');
		expect(initialState).toHaveProperty('ui');
		expect(initialState).toHaveProperty('operations');
		expect(initialState).toHaveProperty('telemetry');
	});
});
