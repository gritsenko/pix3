/**
 * Public Engine API for User Scripts
 *
 * This module exports all public classes, interfaces, and utilities that user scripts
 * can import via '@pix3/engine'. It serves as the public contract between the editor
 * and user-authored scripts.
 *
 * User scripts will write:
 *   import { ScriptControllerBase, NodeBase } from '@pix3/engine';
 *
 * At runtime, this will resolve to the engine API exposed through the import map.
 */

// Core script system
export { Script } from '@pix3/runtime';
export type { ScriptComponent, Constructor } from '@pix3/runtime';

// Node system
export { NodeBase } from '@pix3/runtime';
export type { NodeBaseProps, NodeMetadata } from '@pix3/runtime';

// Node types that users might reference
export { Node2D } from '@pix3/runtime';
export { Node3D } from '@pix3/runtime';

// Property schema system for defining script parameters
export type {
  PropertySchema,
  PropertyDefinition,
  PropertyType,
  PropertyUIHints,
} from '@pix3/runtime';

// State management (if users need to read app state)
export { appState } from '@/state';
export { snapshot } from 'valtio/vanilla';

// Commonly used decorators and utilities
// Note: decorators require reflect-metadata which is already included in main.ts
export { property, state } from 'lit/decorators.js';
