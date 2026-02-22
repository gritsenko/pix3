import 'reflect-metadata';

import {
  AssetLoader,
  registerBuiltInScripts,
  ResourceManager,
  RuntimeRenderer,
  SceneLoader,
  SceneManager,
  SceneRunner,
  SceneSaver,
  ScriptRegistry,
} from '@pix3/runtime';
import { activeScenePath, scenePaths } from './generated/scene-manifest';
import { registerProjectScripts } from './register-project-scripts';
import { embeddedAssets } from 'virtual:runtime-embedded-assets';

async function bootstrap(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) {
    throw new Error('Missing #app container');
  }

  const resourceManager = new ResourceManager('/', embeddedAssets);
  const scriptRegistry = new ScriptRegistry();
  registerBuiltInScripts(scriptRegistry);
  registerProjectScripts(scriptRegistry);

  const assetLoader = new AssetLoader(resourceManager);
  const sceneLoader = new SceneLoader(assetLoader, scriptRegistry);
  const sceneSaver = new SceneSaver();
  const sceneManager = new SceneManager(sceneLoader, sceneSaver);

  const scenePath = activeScenePath || scenePaths[0];
  if (!scenePath) {
    throw new Error('No scenes found for runtime build');
  }

  const sceneText = await resourceManager.readText(`res://${scenePath}`);
  const graph = await sceneManager.parseScene(sceneText, { filePath: scenePath });
  sceneManager.setActiveSceneGraph(scenePath, graph);

  const renderer = new RuntimeRenderer({ antialias: true, shadows: true });
  renderer.attach(app);

  const runner = new SceneRunner(sceneManager, renderer);
  await runner.startScene(scenePath);
}

void bootstrap().catch(error => {
  console.error('[RuntimeBuild] Failed to bootstrap game:', error);
});