import { Object3D } from 'three';
import type { PropertySchema } from '@/fw';

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
