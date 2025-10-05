import { Object3D } from 'three';

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

  get treeColor(): string {
    return '#fff';
  }

  get treeIcon(): string {
    return 'box';
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
}
