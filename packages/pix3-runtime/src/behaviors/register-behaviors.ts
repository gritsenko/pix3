/**
 * Register built-in script components
 *
 * This module registers all built-in script components with the ScriptRegistry.
 * Import this module and pass the registry instance to register components.
 */

import { ScriptRegistry } from '../core/ScriptRegistry';
import { TestRotateBehavior } from './TestRotateBehavior';
import { SimpleMoveBehavior } from './SimpleMoveBehavior';

/**
 * Register all built-in script components
 */
export function registerBuiltInScripts(registry: ScriptRegistry): void {
  // Register test/example components
  registry.registerComponent({
    id: 'core:TestRotate',
    displayName: 'Test Rotate',
    description: 'Rotates a 3D node continuously (for testing)',
    category: 'Test',
    componentClass: TestRotateBehavior,
    keywords: ['rotate', 'test', 'animation'],
  });

  registry.registerComponent({
    id: 'core:SimpleMove',
    displayName: 'Simple Move',
    description: 'Moves a 3D node in a simple pattern (for testing)',
    category: 'Test',
    componentClass: SimpleMoveBehavior,
    keywords: ['move', 'test', 'animation'],
  });

  console.log('[ScriptRegistry] Registered built-in script components');
}
