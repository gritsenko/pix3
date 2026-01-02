import { Object3D } from 'three';
import type { PropertySchema } from '@/fw';
import type { ScriptComponent, Behavior, ScriptController, Constructor } from '@/core/ScriptComponent';

export interface NodeMetadata {
  [key: string]: unknown;
}

export interface NodeBaseProps {
  id: string;
  type?: string;
  name?: string;
  instancePath?: string | null;
  properties?: Record<string, unknown>;
  metadata?: NodeMetadata;
}

export class NodeBase extends Object3D {
  readonly nodeId: string;
  readonly type: string;
  override name: string;
  override children!: NodeBase[];
  readonly properties: Record<string, unknown>;
  readonly metadata: NodeMetadata;
  readonly instancePath: string | null;
  /** Whether this node can have children. */
  isContainer: boolean = true;
  /** Script components attached to this node */
  readonly components: ScriptComponent[] = [];
  
  // Legacy fields - kept for backward compatibility during migration
  /** @deprecated Use components instead */
  get behaviors(): Behavior[] {
    return this.components.filter(c => 'parameters' in c) as Behavior[];
  }
  /** @deprecated Use components instead */
  get controller(): ScriptController | null {
    // For backward compatibility, return the first component that was registered as a controller
    const ctrl = this.components.find(c => (c as any)._isController);
    return ctrl ? (ctrl as ScriptController) : null;
  }
  set controller(value: ScriptController | null) {
    // For backward compatibility, mark this component as a controller
    if (value) {
      (value as any)._isController = true;
      this.addComponent(value);
    }
  }

  constructor(props: NodeBaseProps) {
    super();

    this.nodeId = props.id;
    this.uuid = props.id;
    this.type = props.type ?? 'Group';
    this.name = props.name ?? this.type;
    this.properties = { ...(props.properties ?? {}) };
    this.metadata = { ...(props.metadata ?? {}) };
    this.instancePath = props.instancePath ?? null;

    // Initialize visibility and lock state from properties
    if (this.properties.visible !== undefined) {
      this.visible = !!this.properties.visible;
    }
    if (this.properties.locked !== undefined) {
      this.userData.locked = !!this.properties.locked;
    }

    this.userData = {
      ...this.userData,
      nodeId: this.nodeId,
      metadata: this.metadata,
      properties: this.properties,
    };
  }

  get parentNode(): NodeBase | null {
    return this.parent instanceof NodeBase ? this.parent : null;
  }

  adoptChild(child: NodeBase): void {
    if (child === this) {
      throw new Error('Cannot adopt node as its own child.');
    }
    this.add(child);
  }

  disownChild(child: NodeBase): void {
    this.remove(child);
  }

  findById(id: string): NodeBase | null {
    if (this.nodeId === id) {
      return this;
    }
    for (const child of this.children) {
      const match = child instanceof NodeBase ? child.findById(id) : null;
      if (match) {
        return match;
      }
    }
    return null;
  }

  /**
   * Add a script component to this node.
   * If the node's scene is already running, calls onStart immediately.
   * @param component - The script component to add
   */
  addComponent(component: ScriptComponent): void {
    if (this.components.includes(component)) {
      console.warn(`[NodeBase] Component ${component.id} is already attached to node ${this.nodeId}`);
      return;
    }

    // Attach to node
    component.node = this;
    this.components.push(component);

    // Call onAttach if defined
    if (component.onAttach) {
      component.onAttach(this);
    }

    // If the scene is already running (node has been started), start the component immediately
    // We detect this by checking if any existing component has been started
    const sceneRunning = this.components.some(c => c._started);
    if (sceneRunning && component.enabled && component.onStart) {
      component.onStart();
      component._started = true;
    }
  }

  /**
   * Get a component of a specific type from this node.
   * @param type - The constructor/class of the component type to find
   * @returns The first component of the specified type, or null if not found
   */
  getComponent<T extends ScriptComponent>(type: Constructor<T>): T | null {
    const component = this.components.find(c => c instanceof type);
    return component ? (component as T) : null;
  }

  /**
   * Remove a script component from this node.
   * Calls onDetach and removes it from the components array.
   * @param component - The script component to remove
   */
  removeComponent(component: ScriptComponent): void {
    const index = this.components.indexOf(component);
    if (index === -1) {
      console.warn(`[NodeBase] Component ${component.id} is not attached to node ${this.nodeId}`);
      return;
    }

    // Call onDetach if defined
    if (component.onDetach) {
      component.onDetach();
    }

    // Reset started state
    if (component.resetStartedState) {
      component.resetStartedState();
    }

    // Remove from node
    component.node = null;
    this.components.splice(index, 1);
  }

  /**
   * Tick method called every frame to update scripts.
   * Calls onUpdate on enabled components and recursively on children.
   * @param dt - Delta time in seconds since last frame
   */
  tick(dt: number): void {
    // Update all enabled components
    for (const component of this.components) {
      if (component.enabled) {
        // Call onStart on first update
        if (!component._started && component.onStart) {
          component.onStart();
          component._started = true;
        }
        // Call onUpdate
        if (component.onUpdate) {
          component.onUpdate(dt);
        }
      }
    }

    // Recursively tick children
    for (const child of this.children) {
      if (child instanceof NodeBase) {
        child.tick(dt);
      }
    }
  }

  /**
   * Get the property schema for this node type.
   * Defines all editable properties and their metadata for the inspector.
   * Override in subclasses to extend with additional properties.
   */
  static getPropertySchema(): PropertySchema {
    return {
      nodeType: 'NodeBase',
      properties: [
        {
          name: 'id',
          type: 'string',
          ui: {
            label: 'Node ID',
            description: 'Unique identifier for this node',
            group: 'Base',
            readOnly: true,
          },
          getValue: (node: unknown) => (node as NodeBase).nodeId,
          setValue: () => {
            // Read-only, no-op
          },
        },
        {
          name: 'name',
          type: 'string',
          ui: {
            label: 'Name',
            description: 'Display name for this node',
            group: 'Base',
          },
          getValue: (node: unknown) => (node as NodeBase).name,
          setValue: (node: unknown, value: unknown) => {
            (node as NodeBase).name = String(value);
          },
        },
        {
          name: 'type',
          type: 'string',
          ui: {
            label: 'Type',
            description: 'Node type',
            group: 'Base',
            readOnly: true,
          },
          getValue: (node: unknown) => (node as NodeBase).type,
          setValue: () => {
            // Read-only, no-op
          },
        },
        {
          name: 'visible',
          type: 'boolean',
          ui: {
            label: 'Visible',
            description: 'Whether the node is visible in the viewport',
            group: 'Base',
          },
          getValue: (node: unknown) => (node as NodeBase).visible,
          setValue: (node: unknown, value: unknown) => {
            const n = node as NodeBase;
            const v = !!value;
            n.visible = v;
            n.properties.visible = v;
          },
        },
        {
          name: 'locked',
          type: 'boolean',
          ui: {
            label: 'Locked',
            description: 'Whether the node is locked and cannot be selected in the viewport',
            group: 'Base',
          },
          getValue: (node: unknown) => !!(node as NodeBase).userData.locked,
          setValue: (node: unknown, value: unknown) => {
            const n = node as NodeBase;
            const v = !!value;
            n.userData.locked = v;
            n.properties.locked = v;
          },
        },
      ],
      groups: {
        Base: {
          label: 'Base Properties',
          description: 'Core node properties',
          expanded: true,
        },
      },
    };
  }
}
