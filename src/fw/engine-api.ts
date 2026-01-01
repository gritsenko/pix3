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
export { BehaviorBase, ScriptControllerBase } from '@/core/ScriptComponent';
export type { Behavior, ScriptController, ScriptLifecycle } from '@/core/ScriptComponent';

// Node system
export { NodeBase } from '@/nodes/NodeBase';
export type { NodeBaseProps, NodeMetadata } from '@/nodes/NodeBase';

// Node types that users might reference
export { Node2D } from '@/nodes/Node2D';
export { Node3D } from '@/nodes/Node3D';

// Property schema system for defining script parameters
export type {
  PropertySchema,
  PropertyDefinition,
  PropertyType,
  PropertyUIHints,
} from '@/fw/property-schema';

// State management (if users need to read app state)
export { appState } from '@/state';
export { snapshot } from 'valtio/vanilla';

// Commonly used decorators and utilities
// Note: decorators require reflect-metadata which is already included in main.ts
export { property, state } from 'lit/decorators.js';
