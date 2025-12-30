import 'reflect-metadata';
import 'golden-layout/dist/css/goldenlayout-base.css';
import 'golden-layout/dist/css/themes/goldenlayout-dark-theme.css';

import './index.css';

// Register built-in behaviors before loading any scenes
import { registerBuiltInScripts } from './behaviors/register-behaviors';
registerBuiltInScripts();

import './ui/scene-tree/scene-tree-panel';
import './ui/viewport/viewport-panel';
import './ui/object-inspector/inspector-panel';
import './ui/assets-browser/asset-browser-panel';
import './ui/pix3-editor-shell';
