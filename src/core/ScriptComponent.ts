/**
 * Script Component Framework
 *
 * Defines the core interfaces for Godot-style behaviors and script controllers.
 * Behaviors are reusable components that can be attached to nodes, while
 * ScriptControllers provide node-specific logic with full access to the node.
 *
 * This system supports:
 * - Lifecycle methods (onAttach, onStart, onUpdate, onDetach)
 * - PropertySchema integration for inspector editing
 * - Enable/disable runtime toggling
 * - Static imports for behaviors and controllers
 */

import type { PropertySchema } from '@/fw';
import type { NodeBase } from '@/nodes/NodeBase';

/**
 * Base interface for all script components (Behaviors and Controllers).
 * Provides lifecycle hooks and enable/disable support.
 */
export interface ScriptComponent {
  /** Unique identifier for this script component instance */
  readonly id: string;

  /** Whether this script component is currently enabled and should run */
  enabled: boolean;

  /** Reference to the node this component is attached to */
  node: NodeBase | null;

  /**
   * Called when the component is first attached to a node.
   * Use for initialization that requires node access.
   */
  onAttach?(node: NodeBase): void;

  /**
   * Called on the first frame after attachment, or when re-enabled.
   * Use for logic that should run once at startup.
   */
  onStart?(): void;

  /**
   * Called every frame with delta time in seconds.
   * Only called when enabled is true.
   * @param dt - Time elapsed since last frame in seconds
   */
  onUpdate?(dt: number): void;

  /**
   * Called when the component is detached from a node or scene is unloaded.
   * Use for cleanup (timers, event listeners, etc.).
   */
  onDetach?(): void;
}

/**
 * Behavior - Reusable component that can be attached to any node.
 * Behaviors use PropertySchema to expose configurable parameters.
 * Multiple behaviors can be attached to the same node.
 *
 * Example: RotateBehavior, FollowMouseBehavior, BounceBehavior
 */
export interface Behavior extends ScriptComponent {
  /** Behavior type name (must match registry key) */
  readonly type: string;

  /** Parameter values configured for this behavior instance */
  readonly params: Record<string, unknown>;
}

/**
 * Constructor type for Behavior classes.
 * Behaviors must be instantiable with an ID and optional parameters.
 */
export interface BehaviorConstructor {
  new (id: string, params?: Record<string, unknown>): Behavior;

  /**
   * Define the property schema for this behavior's parameters.
   * Used by the inspector to generate UI for editing behavior parameters.
   */
  getPropertySchema(): PropertySchema;
}

/**
 * ScriptController - Single controller per node for node-specific logic.
 * Controllers have full access to their node and can coordinate behaviors.
 * Only one controller can be attached to a node at a time.
 *
 * Example: PlayerController, EnemyController, UIController
 */
export interface ScriptController extends ScriptComponent {
  /** Controller type name (must match registry key) */
  readonly type: string;

  /** Parameter values configured for this controller instance */
  readonly params: Record<string, unknown>;
}

/**
 * Constructor type for ScriptController classes.
 */
export interface ScriptControllerConstructor {
  new (id: string, params?: Record<string, unknown>): ScriptController;

  /**
   * Define the property schema for this controller's parameters.
   * Used by the inspector to generate UI for editing controller parameters.
   */
  getPropertySchema(): PropertySchema;
}

/**
 * Base class for implementing behaviors with common functionality.
 */
export abstract class BehaviorBase implements Behavior {
  public enabled: boolean = true;
  public node: NodeBase | null = null;
  private hasStarted: boolean = false;

  constructor(
    public readonly id: string,
    public readonly type: string,
    public readonly params: Record<string, unknown> = {}
  ) {}

  /**
   * Internal method called by the script execution system.
   * Manages lifecycle state and delegates to user-defined hooks.
   */
  _tick(dt: number): void {
    if (!this.enabled || !this.node) return;

    if (!this.hasStarted) {
      this.onStart?.();
      this.hasStarted = true;
    }

    this.onUpdate?.(dt);
  }

  /**
   * Internal method called when attached to a node.
   */
  _attach(node: NodeBase): void {
    this.node = node;
    this.hasStarted = false;
    this.onAttach?.(node);
  }

  /**
   * Internal method called when detached from a node.
   */
  _detach(): void {
    this.onDetach?.();
    this.node = null;
    this.hasStarted = false;
  }

  // Lifecycle hooks - override in subclasses
  onAttach?(node: NodeBase): void;
  onStart?(): void;
  onUpdate?(dt: number): void;
  onDetach?(): void;
}

/**
 * Base class for implementing script controllers with common functionality.
 */
export abstract class ScriptControllerBase implements ScriptController {
  public enabled: boolean = true;
  public node: NodeBase | null = null;
  private hasStarted: boolean = false;

  constructor(
    public readonly id: string,
    public readonly type: string,
    public readonly params: Record<string, unknown> = {}
  ) {}

  /**
   * Internal method called by the script execution system.
   * Manages lifecycle state and delegates to user-defined hooks.
   */
  _tick(dt: number): void {
    if (!this.enabled || !this.node) return;

    if (!this.hasStarted) {
      this.onStart?.();
      this.hasStarted = true;
    }

    this.onUpdate?.(dt);
  }

  /**
   * Internal method called when attached to a node.
   */
  _attach(node: NodeBase): void {
    this.node = node;
    this.hasStarted = false;
    this.onAttach?.(node);
  }

  /**
   * Internal method called when detached from a node.
   */
  _detach(): void {
    this.onDetach?.();
    this.node = null;
    this.hasStarted = false;
  }

  // Lifecycle hooks - override in subclasses
  onAttach?(node: NodeBase): void;
  onStart?(): void;
  onUpdate?(dt: number): void;
  onDetach?(): void;
}
