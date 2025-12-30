/**
 * ScriptRegistry - Registry for behaviors and script controllers
 *
 * Similar to NodeRegistry, this service maintains a mapping of script component
 * type names to their implementation classes. Each class must have a static
 * getPropertySchema() method for parameter definitions.
 */

import { injectable } from '@/fw/di';
import type { PropertySchema } from '@/fw';
import type { Behavior, ScriptController } from '@/core/ScriptComponent';

/**
 * Behavior type definition for the registry
 */
export interface BehaviorTypeInfo {
  /** Unique identifier/type name */
  id: string;

  /** Display name for UI */
  displayName: string;

  /** Description of what this behavior does */
  description: string;

  /** Category for grouping in UI */
  category: string;

  /** Constructor for the behavior class */
  behaviorClass: new (id: string, type: string) => Behavior;

  /** Keywords for search */
  keywords: string[];
}

/**
 * Controller type definition for the registry
 */
export interface ControllerTypeInfo {
  /** Unique identifier/type name */
  id: string;

  /** Display name for UI */
  displayName: string;

  /** Description of what this controller does */
  description: string;

  /** Category for grouping in UI */
  category: string;

  /** Constructor for the controller class */
  controllerClass: new (id: string, type: string) => ScriptController;

  /** Keywords for search */
  keywords: string[];
}

/**
 * Registry service for script components (behaviors and controllers)
 */
@injectable()
export class ScriptRegistry {
  private behaviors = new Map<string, BehaviorTypeInfo>();
  private controllers = new Map<string, ControllerTypeInfo>();

  constructor() {
    // Register built-in behaviors and controllers here
    // For now, registry starts empty - behaviors/controllers will be registered
    // by feature modules or plugins
  }

  /**
   * Register a behavior type
   */
  registerBehavior(info: BehaviorTypeInfo): void {
    if (this.behaviors.has(info.id)) {
      console.warn(`[ScriptRegistry] Behavior "${info.id}" is already registered. Overwriting.`);
    }
    this.behaviors.set(info.id, info);
  }

  /**
   * Register a controller type
   */
  registerController(info: ControllerTypeInfo): void {
    if (this.controllers.has(info.id)) {
      console.warn(`[ScriptRegistry] Controller "${info.id}" is already registered. Overwriting.`);
    }
    this.controllers.set(info.id, info);
  }

  /**
   * Get a behavior type by ID
   */
  getBehaviorType(id: string): BehaviorTypeInfo | undefined {
    return this.behaviors.get(id);
  }

  /**
   * Get a controller type by ID
   */
  getControllerType(id: string): ControllerTypeInfo | undefined {
    return this.controllers.get(id);
  }

  /**
   * Get all registered behavior types
   */
  getAllBehaviorTypes(): BehaviorTypeInfo[] {
    return Array.from(this.behaviors.values());
  }

  /**
   * Get all registered controller types
   */
  getAllControllerTypes(): ControllerTypeInfo[] {
    return Array.from(this.controllers.values());
  }

  /**
   * Create a behavior instance from a type ID
   */
  createBehavior(typeId: string, instanceId: string): Behavior | null {
    const typeInfo = this.behaviors.get(typeId);
    if (!typeInfo) {
      console.error(`[ScriptRegistry] Behavior type "${typeId}" not found in registry.`);
      return null;
    }

    try {
      const behavior = new typeInfo.behaviorClass(instanceId, typeId);
      return behavior;
    } catch (error) {
      console.error(`[ScriptRegistry] Failed to instantiate behavior "${typeId}":`, error);
      return null;
    }
  }

  /**
   * Create a controller instance from a type ID
   */
  createController(typeId: string, instanceId: string): ScriptController | null {
    const typeInfo = this.controllers.get(typeId);
    if (!typeInfo) {
      console.error(`[ScriptRegistry] Controller type "${typeId}" not found in registry.`);
      return null;
    }

    try {
      const controller = new typeInfo.controllerClass(instanceId, typeId);
      return controller;
    } catch (error) {
      console.error(`[ScriptRegistry] Failed to instantiate controller "${typeId}":`, error);
      return null;
    }
  }

  /**
   * Get property schema for a behavior type
   */
  getBehaviorPropertySchema(typeId: string): PropertySchema | null {
    const typeInfo = this.behaviors.get(typeId);
    if (!typeInfo) {
      return null;
    }

    // Access static method through the constructor
    const behaviorClass = typeInfo.behaviorClass as unknown as {
      getPropertySchema(): PropertySchema;
    };

    if (typeof behaviorClass.getPropertySchema === 'function') {
      return behaviorClass.getPropertySchema();
    }

    return null;
  }

  /**
   * Get property schema for a controller type
   */
  getControllerPropertySchema(typeId: string): PropertySchema | null {
    const typeInfo = this.controllers.get(typeId);
    if (!typeInfo) {
      return null;
    }

    // Access static method through the constructor
    const controllerClass = typeInfo.controllerClass as unknown as {
      getPropertySchema(): PropertySchema;
    };

    if (typeof controllerClass.getPropertySchema === 'function') {
      return controllerClass.getPropertySchema();
    }

    return null;
  }

  /**
   * Search behaviors by keyword
   */
  searchBehaviors(query: string): BehaviorTypeInfo[] {
    const lowercaseQuery = query.toLowerCase();
    return this.getAllBehaviorTypes().filter(
      behavior =>
        behavior.displayName.toLowerCase().includes(lowercaseQuery) ||
        behavior.description.toLowerCase().includes(lowercaseQuery) ||
        behavior.keywords.some(keyword => keyword.toLowerCase().includes(lowercaseQuery))
    );
  }

  /**
   * Search controllers by keyword
   */
  searchControllers(query: string): ControllerTypeInfo[] {
    const lowercaseQuery = query.toLowerCase();
    return this.getAllControllerTypes().filter(
      controller =>
        controller.displayName.toLowerCase().includes(lowercaseQuery) ||
        controller.description.toLowerCase().includes(lowercaseQuery) ||
        controller.keywords.some(keyword => keyword.toLowerCase().includes(lowercaseQuery))
    );
  }

  /**
   * Dispose the registry
   */
  dispose(): void {
    this.behaviors.clear();
    this.controllers.clear();
  }
}
