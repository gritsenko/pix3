/**
 * Script Component System
 *
 * Defines the core interfaces for behaviors and script controllers.
 * This system follows the PropertySchema pattern for dynamic parameter configuration.
 */

import type { PropertySchema } from '@/fw';
import type { NodeBase } from '@/nodes/NodeBase';

/**
 * Base lifecycle interface for script components (behaviors and controllers).
 * All script components implement these lifecycle methods.
 */
export interface ScriptLifecycle {
  /**
   * Called when the script component is attached to a node.
   * Use this to initialize references and set up state.
   */
  onAttach?(node: NodeBase): void;

  /**
   * Called on the first frame after attachment, before the first onUpdate.
   * Use this to perform initialization that depends on the scene being fully loaded.
   */
  onStart?(): void;

  /**
   * Called every frame with the delta time in seconds.
   * Use this to update state and animate properties.
   */
  onUpdate?(dt: number): void;

  /**
   * Called when the script component is detached from a node or the scene is unloaded.
   * Use this to clean up resources and remove event listeners.
   */
  onDetach?(): void;
}

/**
 * Behavior - A reusable component that can be attached to nodes.
 * Multiple behaviors can be attached to a single node.
 * Behaviors have parameters that can be configured via PropertySchema.
 */
export interface Behavior extends ScriptLifecycle {
  /** Unique identifier for this behavior instance */
  readonly id: string;

  /** Type name of this behavior (matches registry key) */
  readonly type: string;

  /** Reference to the node this behavior is attached to */
  node: NodeBase | null;

  /** Whether this behavior is currently active and receiving updates */
  enabled: boolean;

  /** Parameter storage - values configured via PropertySchema */
  parameters: Record<string, unknown>;

  /** Flag to track if onStart has been called */
  _started: boolean;
}

/**
 * Script Controller - A single controller attached to a node.
 * Only one controller can be attached per node.
 * Controllers are typically used for primary node logic.
 */
export interface ScriptController extends ScriptLifecycle {
  /** Unique identifier for this controller instance */
  readonly id: string;

  /** Type name of this controller (matches registry key) */
  readonly type: string;

  /** Reference to the node this controller is attached to */
  node: NodeBase | null;

  /** Whether this controller is currently active and receiving updates */
  enabled: boolean;

  /** Parameter storage - values configured via PropertySchema */
  parameters: Record<string, unknown>;

  /** Flag to track if onStart has been called */
  _started: boolean;
}

/**
 * Base class for behaviors providing default implementations.
 * Extend this class to create custom behaviors.
 */
export abstract class BehaviorBase implements Behavior {
  readonly id: string;
  readonly type: string;
  node: NodeBase | null = null;
  enabled: boolean = true;
  parameters: Record<string, unknown> = {};
  _started: boolean = false;

  constructor(id: string, type: string) {
    this.id = id;
    this.type = type;
  }

  /**
   * Get the property schema for this behavior's parameters.
   * Override this method to define editable parameters.
   */
  static getPropertySchema(): PropertySchema {
    return {
      nodeType: 'BehaviorBase',
      properties: [],
      groups: {},
    };
  }

  onAttach?(node: NodeBase): void;
  onStart?(): void;
  onUpdate?(dt: number): void;
  onDetach?(): void;
}

/**
 * Base class for script controllers providing default implementations.
 * Extend this class to create custom controllers.
 */
export abstract class ScriptControllerBase implements ScriptController {
  readonly id: string;
  readonly type: string;
  node: NodeBase | null = null;
  enabled: boolean = true;
  parameters: Record<string, unknown> = {};
  _started: boolean = false;

  constructor(id: string, type: string) {
    this.id = id;
    this.type = type;
  }

  /**
   * Get the property schema for this controller's parameters.
   * Override this method to define editable parameters.
   */
  static getPropertySchema(): PropertySchema {
    return {
      nodeType: 'ScriptControllerBase',
      properties: [],
      groups: {},
    };
  }

  onAttach?(node: NodeBase): void;
  onStart?(): void;
  onUpdate?(dt: number): void;
  onDetach?(): void;
}

/**
 * Type guard to check if an object is a Behavior
 */
export function isBehavior(obj: unknown): obj is Behavior {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'type' in obj &&
    'enabled' in obj &&
    'parameters' in obj
  );
}

/**
 * Type guard to check if an object is a ScriptController
 */
export function isScriptController(obj: unknown): obj is ScriptController {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'type' in obj &&
    'enabled' in obj &&
    'parameters' in obj
  );
}
