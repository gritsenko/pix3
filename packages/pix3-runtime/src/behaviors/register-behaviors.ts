/**
 * Register built-in script components
 *
 * This module registers all built-in script components with the ScriptRegistry.
 * Import this module and pass the registry instance to register components.
 */

import { ScriptRegistry } from '../core/ScriptRegistry';
import { RotateBehavior } from './RotateBehavior';
import { SimpleMoveBehavior } from './SimpleMoveBehavior';
import { SineBehavior } from './SineBehavior';
import { PinToNodeBehavior } from './PinToNodeBehavior';
import { FollowBehavior } from './FollowBehavior';

/**
 * Register all built-in script components
 */
export function registerBuiltInScripts(registry: ScriptRegistry): void {
  // Register test/example components
  registry.registerComponent({
    id: 'core:Rotate',
    displayName: 'Rotate',
    description: 'Rotates a 3D node continuously',
    category: 'Transform',
    componentClass: RotateBehavior,
    keywords: ['rotate', 'animation'],
  });

  registry.registerComponent({
    id: 'core:SimpleMove',
    displayName: 'Simple Move',
    description: 'Moves a 3D node in a simple pattern (for testing)',
    category: 'Test',
    componentClass: SimpleMoveBehavior,
    keywords: ['move', 'test', 'animation'],
  });

  registry.registerComponent({
    id: 'core:Sine',
    displayName: 'Sine Oscillator',
    description: 'Oscillates a node along a selected axis',
    category: 'Animation',
    componentClass: SineBehavior,
    keywords: ['sine', 'oscillation', 'animation'],
  });

  registry.registerComponent({
    id: 'core:PinToNode',
    displayName: 'Pin to Node',
    description: 'Pins a 2D UI node to a 3D target node',
    category: 'UI',
    componentClass: PinToNodeBehavior,
    keywords: ['ui', 'tracking', 'pin'],
  });

  registry.registerComponent({
    id: 'core:Follow',
    displayName: 'Follow',
    description: 'Smoothly follows a target node position and/or rotation',
    category: 'Transform',
    componentClass: FollowBehavior,
    keywords: ['follow', 'camera', 'tracking', 'smooth'],
  });

  console.log('[ScriptRegistry] Registered built-in script components');
}
