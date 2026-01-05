import 'reflect-metadata';
import 'golden-layout/dist/css/goldenlayout-base.css';
import 'golden-layout/dist/css/themes/goldenlayout-dark-theme.css';

import './index.css';

// Expose Engine API for user scripts
import * as EngineAPI from './fw/engine-api';
(window as any).__PIX3_ENGINE__ = EngineAPI;

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
  // Note: This blob URL is intentionally not revoked as it needs to remain
  // available for the lifetime of the application for dynamic imports to work

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

// Register built-in script components before loading any scenes
import { registerBuiltInScripts } from './behaviors/register-behaviors';
registerBuiltInScripts();

import './ui/scene-tree/scene-tree-panel';
import './ui/viewport/editor-tab';
import './ui/object-inspector/inspector-panel';
import './ui/assets-browser/asset-browser-panel';
import './ui/pix3-editor-shell';
