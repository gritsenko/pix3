import 'reflect-metadata';
import 'golden-layout/dist/css/goldenlayout-base.css';
import 'golden-layout/dist/css/themes/goldenlayout-dark-theme.css';
import './index.css';

// Expose Engine API for user scripts
import * as EngineAPI from '@pix3/runtime';
import * as THREE from 'three';

interface WindowWithEngine extends Window {
  __PIX3_ENGINE__: typeof EngineAPI;
  __PIX3_THREE__: typeof THREE;
}

(window as unknown as WindowWithEngine).__PIX3_ENGINE__ = EngineAPI;
(window as unknown as WindowWithEngine).__PIX3_THREE__ = THREE;

// Create dynamic import map for @pix3/runtime
// This allows user scripts to import from '@pix3/runtime' at runtime
const createImportMapShim = () => {
  // Generate module code that re-exports the global API
  const moduleCode = `
    const api = window.__PIX3_ENGINE__;
    ${Object.keys(EngineAPI).map(key => `export const ${key} = api.${key};`).join('\n')}
  `;

  // Create blob URL for the module
  const blob = new Blob([moduleCode], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);

  // Generate module code for three
  const threeModuleCode = `
    const api = window.__PIX3_THREE__;
    ${Object.keys(THREE).map(key => `export const ${key} = api.${key};`).join('\n')}
    export default api;
  `;
  const threeBlob = new Blob([threeModuleCode], { type: 'application/javascript' });
  const threeBlobUrl = URL.createObjectURL(threeBlob);

  // Inject import map into document
  const importMap = document.createElement('script');
  importMap.type = 'importmap';
  importMap.textContent = JSON.stringify({
    imports: {
      '@pix3/runtime': blobUrl,
      'three': threeBlobUrl,
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
