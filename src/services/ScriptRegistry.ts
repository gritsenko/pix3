/**
 * ScriptRegistry - Central registry for behaviors and script controllers
 *
 * Follows the NodeRegistry pattern to provide discovery and instantiation
 * of script components. Uses static imports for type safety and bundler
 * tree-shaking.
 *
 * Usage:
 *   const registry = ScriptRegistry.getInstance();
 *   const behavior = registry.createBehavior('rotate', { speed: 45 });
 *   const controller = registry.createController('player', {});
 */

import type {
  Behavior,
  BehaviorConstructor,
  ScriptController,
  ScriptControllerConstructor,
} from '@/core/ScriptComponent';
import type { PropertySchema } from '@/fw';

/**
 * Metadata for a registered behavior type
 */
export interface BehaviorTypeInfo {
  /** Unique identifier (registry key) */
  id: string;

  /** Display name for UI */
  displayName: string;

  /** Description of what this behavior does */
  description: string;

  /** Constructor function */
  constructor: BehaviorConstructor;

  /** Category for grouping in UI (e.g., 'Animation', 'Physics', 'Logic') */
  category: string;

  /** Search keywords */
  keywords: string[];
}

/**
 * Metadata for a registered controller type
 */
export interface ControllerTypeInfo {
  /** Unique identifier (registry key) */
  id: string;

  /** Display name for UI */
  displayName: string;

  /** Description of what this controller does */
  description: string;

  /** Constructor function */
  constructor: ScriptControllerConstructor;

  /** Category for grouping in UI (e.g., 'Player', 'Enemy', 'UI') */
  category: string;

  /** Search keywords */
  keywords: string[];
}

/**
 * Registry for script components (behaviors and controllers).
 * Singleton pattern - use getInstance() to access.
 */
export class ScriptRegistry {
  private static instance: ScriptRegistry;
  private behaviors: Map<string, BehaviorTypeInfo> = new Map();
  private controllers: Map<string, ControllerTypeInfo> = new Map();

  private constructor() {
    // Private constructor - use getInstance()
    // Registration happens externally to avoid circular dependencies
  }

  /**
   * Get the singleton instance of the registry
   */
  public static getInstance(): ScriptRegistry {
    if (!ScriptRegistry.instance) {
      ScriptRegistry.instance = new ScriptRegistry();
    }
    return ScriptRegistry.instance;
  }

  /**
   * Register a behavior type
   */
  public registerBehavior(info: BehaviorTypeInfo): void {
    if (this.behaviors.has(info.id)) {
      console.warn(`[ScriptRegistry] Behavior "${info.id}" is already registered. Overwriting.`);
    }
    this.behaviors.set(info.id, info);
  }

  /**
   * Register a controller type
   */
  public registerController(info: ControllerTypeInfo): void {
    if (this.controllers.has(info.id)) {
      console.warn(`[ScriptRegistry] Controller "${info.id}" is already registered. Overwriting.`);
    }
    this.controllers.set(info.id, info);
  }

  /**
   * Create a new behavior instance by type ID
   * @param typeId - Registered behavior type identifier
   * @param params - Parameter values for the behavior
   * @returns New behavior instance or null if type not found
   */
  public createBehavior(
    typeId: string,
    params: Record<string, unknown> = {}
  ): Behavior | null {
    const info = this.behaviors.get(typeId);
    if (!info) {
      console.error(`[ScriptRegistry] Unknown behavior type: "${typeId}"`);
      return null;
    }

    // Generate unique ID for this instance
    const instanceId = `${typeId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    try {
      return new info.constructor(instanceId, params);
    } catch (error) {
      console.error(`[ScriptRegistry] Failed to instantiate behavior "${typeId}":`, error);
      return null;
    }
  }

  /**
   * Create a new controller instance by type ID
   * @param typeId - Registered controller type identifier
   * @param params - Parameter values for the controller
   * @returns New controller instance or null if type not found
   */
  public createController(
    typeId: string,
    params: Record<string, unknown> = {}
  ): ScriptController | null {
    const info = this.controllers.get(typeId);
    if (!info) {
      console.error(`[ScriptRegistry] Unknown controller type: "${typeId}"`);
      return null;
    }

    // Generate unique ID for this instance
    const instanceId = `${typeId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    try {
      return new info.constructor(instanceId, params);
    } catch (error) {
      console.error(`[ScriptRegistry] Failed to instantiate controller "${typeId}":`, error);
      return null;
    }
  }

  /**
   * Get all registered behavior types
   */
  public getAllBehaviors(): BehaviorTypeInfo[] {
    return Array.from(this.behaviors.values());
  }

  /**
   * Get all registered controller types
   */
  public getAllControllers(): ControllerTypeInfo[] {
    return Array.from(this.controllers.values());
  }

  /**
   * Get behavior type info by ID
   */
  public getBehaviorInfo(typeId: string): BehaviorTypeInfo | undefined {
    return this.behaviors.get(typeId);
  }

  /**
   * Get controller type info by ID
   */
  public getControllerInfo(typeId: string): ControllerTypeInfo | undefined {
    return this.controllers.get(typeId);
  }

  /**
   * Get property schema for a behavior type
   */
  public getBehaviorSchema(typeId: string): PropertySchema | null {
    const info = this.behaviors.get(typeId);
    if (!info) return null;

    try {
      return info.constructor.getPropertySchema();
    } catch (error) {
      console.error(`[ScriptRegistry] Failed to get schema for behavior "${typeId}":`, error);
      return null;
    }
  }

  /**
   * Get property schema for a controller type
   */
  public getControllerSchema(typeId: string): PropertySchema | null {
    const info = this.controllers.get(typeId);
    if (!info) return null;

    try {
      return info.constructor.getPropertySchema();
    } catch (error) {
      console.error(`[ScriptRegistry] Failed to get schema for controller "${typeId}":`, error);
      return null;
    }
  }

  /**
   * Search behaviors by keyword
   */
  public searchBehaviors(query: string): BehaviorTypeInfo[] {
    const lowercaseQuery = query.toLowerCase();
    return this.getAllBehaviors().filter(
      info =>
        info.displayName.toLowerCase().includes(lowercaseQuery) ||
        info.description.toLowerCase().includes(lowercaseQuery) ||
        info.keywords.some(keyword => keyword.toLowerCase().includes(lowercaseQuery))
    );
  }

  /**
   * Search controllers by keyword
   */
  public searchControllers(query: string): ControllerTypeInfo[] {
    const lowercaseQuery = query.toLowerCase();
    return this.getAllControllers().filter(
      info =>
        info.displayName.toLowerCase().includes(lowercaseQuery) ||
        info.description.toLowerCase().includes(lowercaseQuery) ||
        info.keywords.some(keyword => keyword.toLowerCase().includes(lowercaseQuery))
    );
  }

  /**
   * Get behaviors organized by category
   */
  public getBehaviorsByCategory(): Map<string, BehaviorTypeInfo[]> {
    const byCategory = new Map<string, BehaviorTypeInfo[]>();

    for (const info of this.behaviors.values()) {
      const category = info.category || 'Other';
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(info);
    }

    return byCategory;
  }

  /**
   * Get controllers organized by category
   */
  public getControllersByCategory(): Map<string, ControllerTypeInfo[]> {
    const byCategory = new Map<string, ControllerTypeInfo[]>();

    for (const info of this.controllers.values()) {
      const category = info.category || 'Other';
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(info);
    }

    return byCategory;
  }

  /**
   * Clear all registrations (primarily for testing)
   */
  public clear(): void {
    this.behaviors.clear();
    this.controllers.clear();
  }
}
