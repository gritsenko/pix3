import 'reflect-metadata';
import 'golden-layout/dist/css/goldenlayout-base.css';
import 'golden-layout/dist/css/themes/goldenlayout-dark-theme.css';
import './index.css';

// Expose Engine API for user scripts
import * as EngineAPI from '@pix3/runtime';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

// Game-specific dependencies exposed for project scripts (DeepCore)
import RAPIER from '@dimforge/rapier3d-compat';

type HapticFunction = (() => void) & {
  confirm: () => void;
  error: () => void;
};

interface WindowWithEngine extends Window {
  __PIX3_ENGINE__: typeof EngineAPI;
  __PIX3_THREE__: typeof THREE;
  __RAPIER__: typeof RAPIER;
  __PIX3_GLTFLoader__: typeof GLTFLoader;
  __PIX3_DRACOLoader__: typeof DRACOLoader;
  __PIX3_IOS_HAPTICS__: {
    haptic: HapticFunction;
  };
}

(window as unknown as WindowWithEngine).__PIX3_ENGINE__ = EngineAPI;
(window as unknown as WindowWithEngine).__PIX3_THREE__ = THREE;
(window as unknown as WindowWithEngine).__RAPIER__ = RAPIER;
(window as unknown as WindowWithEngine).__PIX3_GLTFLoader__ = GLTFLoader;
(window as unknown as WindowWithEngine).__PIX3_DRACOLoader__ = DRACOLoader;
(window as unknown as WindowWithEngine).__PIX3_IOS_HAPTICS__ = {
  haptic: Object.assign(() => undefined, {
    confirm: () => undefined,
    error: () => undefined,
  }),
};

// Create dynamic import map for @pix3/runtime
// This allows user scripts to import from '@pix3/runtime' at runtime
const createImportMapShim = () => {
  // Generate module code that re-exports the global API
  const moduleCode = `
    const api = window.__PIX3_ENGINE__;
    ${Object.keys(EngineAPI)
      .map(key => `export const ${key} = api.${key};`)
      .join('\n')}
  `;

  // Create blob URL for the module
  const blob = new Blob([moduleCode], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);

  // Generate module code for three
  const threeModuleCode = `
    const api = window.__PIX3_THREE__;
    ${Object.keys(THREE)
      .map(key => `export const ${key} = api.${key};`)
      .join('\n')}
    export default api;
  `;
  const threeBlob = new Blob([threeModuleCode], { type: 'application/javascript' });
  const threeBlobUrl = URL.createObjectURL(threeBlob);

  const rapierModuleCode = `
    const api = window.__RAPIER__;
    export default api;
    ${Object.keys(RAPIER)
      .map(key => `export const ${key} = api.${key};`)
      .join('\n')}
  `;
  const rapierBlob = new Blob([rapierModuleCode], { type: 'application/javascript' });
  const rapierBlobUrl = URL.createObjectURL(rapierBlob);

  const gltfLoaderModuleCode = `
    const api = window.__PIX3_GLTFLoader__;
    export const GLTFLoader = api;
    export default api;
  `;
  const gltfLoaderBlob = new Blob([gltfLoaderModuleCode], { type: 'application/javascript' });
  const gltfLoaderBlobUrl = URL.createObjectURL(gltfLoaderBlob);

  const dracoLoaderModuleCode = `
    const api = window.__PIX3_DRACOLoader__;
    export const DRACOLoader = api;
    export default api;
  `;
  const dracoLoaderBlob = new Blob([dracoLoaderModuleCode], { type: 'application/javascript' });
  const dracoLoaderBlobUrl = URL.createObjectURL(dracoLoaderBlob);

  const iosHapticsModuleCode = `
    const api = window.__PIX3_IOS_HAPTICS__;
    export const haptic = api.haptic;
    export default api;
  `;
  const iosHapticsBlob = new Blob([iosHapticsModuleCode], { type: 'application/javascript' });
  const iosHapticsBlobUrl = URL.createObjectURL(iosHapticsBlob);

  // Inject import map into document
  const importMap = document.createElement('script');
  importMap.type = 'importmap';
  importMap.textContent = JSON.stringify({
    imports: {
      '@pix3/runtime': blobUrl,
      three: threeBlobUrl,
      '@dimforge/rapier3d-compat': rapierBlobUrl,
      'three/examples/jsm/loaders/GLTFLoader.js': gltfLoaderBlobUrl,
      'three/examples/jsm/loaders/DRACOLoader.js': dracoLoaderBlobUrl,
      'ios-haptics': iosHapticsBlobUrl,
    },
  });
  document.head.appendChild(importMap);
  console.log('[Pix3] Engine API exposed and import map created for user scripts');
};

createImportMapShim();

// Register runtime services
import { registerRuntimeServices } from './core/register-runtime-services';
import { ServiceContainer } from './fw/di';

registerRuntimeServices();

// Register built-in script components
import { ScriptRegistry, registerBuiltInScripts } from '@pix3/runtime';

const container = ServiceContainer.getInstance();
const registry = container.getService<ScriptRegistry>(container.getOrCreateToken(ScriptRegistry));
registerBuiltInScripts(registry);

import './ui/scene-tree/scene-tree-panel';
import './ui/viewport/editor-tab';
import './ui/object-inspector/inspector-panel';
import './ui/assets-browser/asset-browser-panel';
import './ui/pix3-editor-shell';
