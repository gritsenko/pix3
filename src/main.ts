import 'reflect-metadata';
import 'golden-layout/dist/css/goldenlayout-base.css';
import 'golden-layout/dist/css/themes/goldenlayout-dark-theme.css';
import './index.css';

// Expose Engine API for user scripts
import * as EngineAPI from '@pix3/runtime';

interface WindowWithEngine extends Window {
  __PIX3_ENGINE__: typeof EngineAPI;
}

(window as unknown as WindowWithEngine).__PIX3_ENGINE__ = EngineAPI;

// Create dynamic import map for @pix3/runtime
// This allows user scripts to import from '@pix3/runtime' at runtime
const createImportMapShim = () => {
  // Generate module code that re-exports the global API
  const moduleCode = `
    const api = window.__PIX3_ENGINE__;
    export const AssetLoader = api.AssetLoader;
    export const ResourceManager = api.ResourceManager;
    export const ScriptRegistry = api.ScriptRegistry;
    export const SceneLoader = api.SceneLoader;
    export const SceneSaver = api.SceneSaver;
    export const SceneManager = api.SceneManager;
    export const SceneRunner = api.SceneRunner;
    export const RuntimeRenderer = api.RuntimeRenderer;
    export const InputService = api.InputService;
    export const Script = api.Script;
    export const NodeBase = api.NodeBase;
    export const Node2D = api.Node2D;
    export const Node3D = api.Node3D;
    export const Sprite2D = api.Sprite2D;
    export const Group2D = api.Group2D;
    export const Layout2D = api.Layout2D;
    export const UIControl2D = api.UIControl2D;
    export const Joystick2D = api.Joystick2D;
    export const Button2D = api.Button2D;
    export const Label2D = api.Label2D;
    export const Slider2D = api.Slider2D;
    export const Bar2D = api.Bar2D;
    export const Checkbox2D = api.Checkbox2D;
    export const InventorySlot2D = api.InventorySlot2D;
    export const Camera3D = api.Camera3D;
    export const DirectionalLightNode = api.DirectionalLightNode;
    export const GeometryMesh = api.GeometryMesh;
    export const MeshInstance = api.MeshInstance;
    export const Sprite3D = api.Sprite3D;
    export const PointLightNode = api.PointLightNode;
    export const SpotLightNode = api.SpotLightNode;
    export const registerBuiltInScripts = api.registerBuiltInScripts;
    export const RotateBehavior = api.RotateBehavior;
    export const getNodePropertySchema = api.getNodePropertySchema;
    export const getPropertiesByGroup = api.getPropertiesByGroup;
    export const getPropertyDisplayValue = api.getPropertyDisplayValue;
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
      '@pix3/runtime': blobUrl,
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
