/**
 * Register built-in behaviors and controllers
 *
 * This module registers all built-in script components with the ScriptRegistry.
 * Import this module early in the application lifecycle to ensure behaviors
 * are available when scenes are loaded.
 */

import { ServiceContainer } from '@/fw/di';
import { ScriptRegistry } from '@/services/ScriptRegistry';
import { TestRotateBehavior } from './TestRotateBehavior';

/**
 * Register all built-in behaviors and controllers
 */
export function registerBuiltInScripts(): void {
  const container = ServiceContainer.getInstance();
  const token = container.getOrCreateToken(ScriptRegistry);
  const registry = container.getService<ScriptRegistry>(token);

  // Register test/example behaviors
  registry.registerBehavior({
    id: 'test_rotate',
    displayName: 'Test Rotate',
    description: 'Rotates a 3D node continuously (for testing)',
    category: 'Test',
    behaviorClass: TestRotateBehavior,
    keywords: ['rotate', 'test', 'animation'],
  });

  console.log('[ScriptRegistry] Registered built-in behaviors and controllers');
}
