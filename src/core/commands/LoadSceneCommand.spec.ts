import { beforeEach, describe, expect, it } from 'vitest';

import { LoadSceneCommand } from './LoadSceneCommand';
import { appState, resetAppState } from '../../state';
import { ServiceContainer } from '../../fw/di';
import { SceneManager } from '../scene/SceneManager';

const STARTUP_TEMPLATE_URI = 'templ://startup-scene';

describe('LoadSceneCommand', () => {
  const container = ServiceContainer.getInstance();
  const commandToken = container.getOrCreateToken(LoadSceneCommand);
  const sceneManagerToken = container.getOrCreateToken(SceneManager);

  let command: LoadSceneCommand;
  let sceneManager: SceneManager;

  beforeEach(() => {
    resetAppState();
    sceneManager = container.getService(sceneManagerToken);
    sceneManager.dispose();
    command = container.getService(commandToken);
  });

  it('loads templ:// scenes via BaseTemplateService and registers active scene graph', async () => {
    await command.execute({ filePath: STARTUP_TEMPLATE_URI });

    expect(appState.scenes.loadState).toBe('ready');
    expect(appState.scenes.activeSceneId).toBeTruthy();
    expect(appState.scenes.pendingScenePaths).not.toContain(STARTUP_TEMPLATE_URI);

    const graph = sceneManager.getActiveSceneGraph();
    expect(graph).not.toBeNull();
    expect(graph?.rootNodes.length ?? 0).toBeGreaterThan(0);

    const demoNode = graph?.nodeMap.get('demo-box');
    expect(demoNode).toBeDefined();
    const properties = demoNode?.properties as Record<string, unknown> | undefined;
    expect(properties?.material).toBeDefined();
    expect((properties?.material as Record<string, unknown>).color).toBe('#ff0000');
  });
});
