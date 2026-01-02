/**
 * ScriptRegistry - Registry for script components
 *
 * Maintains a unified registry of script components, supporting both the new
 * unified component system and legacy behavior/controller separation for
 * backward compatibility.
 */

import { injectable } from '@/fw/di';
import type { PropertySchema } from '@/fw';
import type { ScriptComponent, Behavior, ScriptController } from '@/core/ScriptComponent';

/**
 * Type for classes that have a static getPropertySchema method
 */
export interface PropertySchemaProvider {
  getPropertySchema(): PropertySchema;
}

/**
 * Component type definition for the unified registry
 */
export interface ComponentTypeInfo {
  /** Unique identifier/type name */
  id: string;

  /** Display name for UI */
  displayName: string;

  /** Description of what this component does */
  description: string;

  /** Category for grouping in UI */
  category: string;

  /** Constructor for the component class */
  componentClass: (new (id: string, type: string) => ScriptComponent) & PropertySchemaProvider;

  /** Keywords for search */
  keywords: string[];
}

/**
 * @deprecated Use ComponentTypeInfo instead
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
  behaviorClass: (new (id: string, type: string) => Behavior) & PropertySchemaProvider;

  /** Keywords for search */
  keywords: string[];
}

/**
 * @deprecated Use ComponentTypeInfo instead
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
  controllerClass: (new (id: string, type: string) => ScriptController) & PropertySchemaProvider;

  /** Keywords for search */
  keywords: string[];
}

/**
 * Registry service for script components
 */
@injectable()
export class ScriptRegistry {
  // Unified component registry
  private components = new Map<string, ComponentTypeInfo>();
  
  // Legacy registries - maintained for backward compatibility
  private behaviors = new Map<string, BehaviorTypeInfo>();
  private controllers = new Map<string, ControllerTypeInfo>();

  constructor() {
    // Register built-in components here
    // For now, registry starts empty - components will be registered
    // by feature modules or plugins
  }

  /**
   * Register a component type (new unified API)
   */
  registerComponent(info: ComponentTypeInfo): void {
    if (this.components.has(info.id)) {
      console.warn(`[ScriptRegistry] Component "${info.id}" is already registered. Overwriting.`);
    }
    this.components.set(info.id, info);
  }

  /**
   * Unregister a component type
   */
  unregisterComponent(id: string): boolean {
    return this.components.delete(id);
  }

  /**
   * Get a component type by ID
   */
  getComponentType(id: string): ComponentTypeInfo | undefined {
    return this.components.get(id);
  }

  /**
   * Get all registered component types
   */
  getAllComponentTypes(): ComponentTypeInfo[] {
    return Array.from(this.components.values());
  }

  /**
   * Create a component instance from a type ID
   */
  createComponent(typeId: string, instanceId: string): ScriptComponent | null {
    // First try unified registry
    const componentInfo = this.components.get(typeId);
    if (componentInfo) {
      try {
        return new componentInfo.componentClass(instanceId, typeId);
      } catch (error) {
        console.error(`[ScriptRegistry] Failed to instantiate component "${typeId}":`, error);
        return null;
      }
    }

    // Fall back to legacy registries for backward compatibility
    const behavior = this.createBehavior(typeId, instanceId);
    if (behavior) return behavior;

    const controller = this.createController(typeId, instanceId);
    if (controller) return controller;

    console.error(`[ScriptRegistry] Component type "${typeId}" not found in registry.`);
    return null;
  }

  /**
   * Get property schema for a component type
   */
  getComponentPropertySchema(typeId: string): PropertySchema | null {
    // Try unified registry first
    const componentInfo = this.components.get(typeId);
    if (componentInfo) {
      return componentInfo.componentClass.getPropertySchema();
    }

    // Fall back to legacy registries
    return this.getBehaviorPropertySchema(typeId) || this.getControllerPropertySchema(typeId);
  }

  /**
   * Search components by keyword
   */
  searchComponents(query: string): ComponentTypeInfo[] {
    const lowercaseQuery = query.toLowerCase();
    return this.getAllComponentTypes().filter(
      component =>
        component.displayName.toLowerCase().includes(lowercaseQuery) ||
        component.description.toLowerCase().includes(lowercaseQuery) ||
        component.keywords.some(keyword => keyword.toLowerCase().includes(lowercaseQuery))
    );
  }

  // Legacy API methods - kept for backward compatibility
  /**
   * @deprecated Use registerComponent instead
   * Register a behavior type
   */
  registerBehavior(info: BehaviorTypeInfo): void {
    if (this.behaviors.has(info.id)) {
      console.warn(`[ScriptRegistry] Behavior "${info.id}" is already registered. Overwriting.`);
    }
    this.behaviors.set(info.id, info);
    
    // Also register in unified registry
    this.components.set(info.id, {
      id: info.id,
      displayName: info.displayName,
      description: info.description,
      category: info.category,
      componentClass: info.behaviorClass as any,
      keywords: info.keywords,
    });
  }

  /**
   * @deprecated Use registerComponent instead
   * Register a controller type
   */
  registerController(info: ControllerTypeInfo): void {
    if (this.controllers.has(info.id)) {
      console.warn(`[ScriptRegistry] Controller "${info.id}" is already registered. Overwriting.`);
    }
    this.controllers.set(info.id, info);
    
    // Also register in unified registry
    this.components.set(info.id, {
      id: info.id,
      displayName: info.displayName,
      description: info.description,
      category: info.category,
      componentClass: info.controllerClass as any,
      keywords: info.keywords,
    });
  }

  /**
   * @deprecated Use unregisterComponent instead
   * Unregister a behavior type
   */
  unregisterBehavior(id: string): boolean {
    this.components.delete(id);
    return this.behaviors.delete(id);
  }

  /**
   * @deprecated Use unregisterComponent instead
   * Unregister a controller type
   */
  unregisterController(id: string): boolean {
    this.components.delete(id);
    return this.controllers.delete(id);
  }

  /**
   * @deprecated Use getComponentType instead
   * Get a behavior type by ID
   */
  getBehaviorType(id: string): BehaviorTypeInfo | undefined {
    return this.behaviors.get(id);
  }

  /**
   * @deprecated Use getComponentType instead
   * Get a controller type by ID
   */
  getControllerType(id: string): ControllerTypeInfo | undefined {
    return this.controllers.get(id);
  }

  /**
   * @deprecated Use getAllComponentTypes instead
   * Get all registered behavior types
   */
  getAllBehaviorTypes(): BehaviorTypeInfo[] {
    return Array.from(this.behaviors.values());
  }

  /**
   * @deprecated Use getAllComponentTypes instead
   * Get all registered controller types
   */
  getAllControllerTypes(): ControllerTypeInfo[] {
    return Array.from(this.controllers.values());
  }

  /**
   * @deprecated Use createComponent instead
   * Create a behavior instance from a type ID
   */
  createBehavior(typeId: string, instanceId: string): Behavior | null {
    const typeInfo = this.behaviors.get(typeId);
    if (!typeInfo) {
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
   * @deprecated Use createComponent instead
   * Create a controller instance from a type ID
   */
  createController(typeId: string, instanceId: string): ScriptController | null {
    const typeInfo = this.controllers.get(typeId);
    if (!typeInfo) {
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
   * @deprecated Use getComponentPropertySchema instead
   * Get property schema for a behavior type
   */
  getBehaviorPropertySchema(typeId: string): PropertySchema | null {
    const typeInfo = this.behaviors.get(typeId);
    if (!typeInfo) {
      return null;
    }

    return typeInfo.behaviorClass.getPropertySchema();
  }

  /**
   * @deprecated Use getComponentPropertySchema instead
   * Get property schema for a controller type
   */
  getControllerPropertySchema(typeId: string): PropertySchema | null {
    const typeInfo = this.controllers.get(typeId);
    if (!typeInfo) {
      return null;
    }

    return typeInfo.controllerClass.getPropertySchema();
  }

  /**
   * @deprecated Use searchComponents instead
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
   * @deprecated Use searchComponents instead
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
    this.components.clear();
    this.behaviors.clear();
    this.controllers.clear();
  }
}
