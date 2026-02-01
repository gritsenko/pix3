import 'reflect-metadata';
import 'golden-layout/dist/css/goldenlayout-base.css';
import 'golden-layout/dist/css/themes/goldenlayout-dark-theme.css';
import './index.css';

// Expose Engine API for user scripts
import * as EngineAPI from './fw/engine-api';

interface WindowWithEngine extends Window {
  __PIX3_ENGINE__: typeof EngineAPI;
}

(window as unknown as WindowWithEngine).__PIX3_ENGINE__ = EngineAPI;

// Create dynamic import map for @pix3/engine
// This allows user scripts to import from '@pix3/engine' at runtime
const createImportMapShim = () => {
  // Generate module code that re-exports the global API
  const moduleCode = `
    const api = window.__PIX3_ENGINE__;
    export const Script = api.Script;
    export const NodeBase = api.NodeBase;
    export const Node2D = api.Node2D;
    export const Node3D = api.Node3D;
    export const appState = api.appState;
    export const snapshot = api.snapshot;
    export const property = api.property;
    export const state = api.state;
  `;

  // Create blob URL for the module
  const blob = new Blob([moduleCode], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);

  // Inject import map into document
  const importMap = document.createElement('script');
  importMap.type = 'importmap';
  importMap.textContent = JSON.stringify({
    imports: {
      '@pix3/engine': blobUrl,
    },
  });
  document.head.appendChild(importMap);
  console.log('[Pix3] Engine API exposed and import map created for user scripts');
};

createImportMapShim();

// Register runtime services
import { registerRuntimeServices } from './core/register-runtime-services';
registerRuntimeServices();

// Register built-in script components
import { ScriptRegistry, registerBuiltInScripts } from '@pix3/runtime';
import { ServiceContainer } from './fw/di';

const container = ServiceContainer.getInstance();
const registry = container.getService<ScriptRegistry>(container.getOrCreateToken(ScriptRegistry));
registerBuiltInScripts(registry);

import './ui/scene-tree/scene-tree-panel';
import './ui/viewport/editor-tab';
import './ui/object-inspector/inspector-panel';
import './ui/assets-browser/asset-browser-panel';
import './ui/pix3-editor-shell';
