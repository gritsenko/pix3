import type { NodeKind } from '../types';

export interface NodeMetadata {
	[key: string]: unknown;
}

export interface NodeBaseProps {
	id: string;
	type?: NodeKind;
	name?: string;
	instancePath?: string | null;
	properties?: Record<string, unknown>;
	metadata?: NodeMetadata;
}

export class NodeBase {
	readonly id: string;
	readonly type: NodeKind;
	name: string;
	readonly children: NodeBase[] = [];
	readonly properties: Record<string, unknown>;
	readonly metadata: NodeMetadata;
	readonly instancePath: string | null;
	private parent: NodeBase | null;

	constructor(props: NodeBaseProps, parent: NodeBase | null = null) {
		this.id = props.id;
		this.type = props.type ?? 'Group';
		this.name = props.name ?? this.type;
		this.properties = { ...(props.properties ?? {}) };
		this.metadata = { ...(props.metadata ?? {}) };
		this.instancePath = props.instancePath ?? null;
		this.parent = parent;
	}

	get parentNode(): NodeBase | null {
		return this.parent;
	}

	protected setParent(parent: NodeBase | null): void {
		this.parent = parent;
	}

	adoptChild(child: NodeBase): void {
		if (child === this) {
			throw new Error('Cannot adopt node as its own child.');
		}
		if (child.parentNode) {
			child.parentNode.disownChild(child);
		}
		child.setParent(this);
		this.children.push(child);
	}

	disownChild(child: NodeBase): void {
		const index = this.children.indexOf(child);
		if (index === -1) {
			return;
		}
		this.children.splice(index, 1);
		child.setParent(null);
	}

	findById(id: string): NodeBase | null {
		if (this.id === id) {
			return this;
		}
		for (const child of this.children) {
			const match = child.findById(id);
			if (match) {
				return match;
			}
		}
		return null;
	}

	toJSON(): Record<string, unknown> {
		return {
			id: this.id,
			type: this.type,
			name: this.name,
			instance: this.instancePath ?? undefined,
			properties: this.properties,
			metadata: this.metadata,
			children: this.children.map((child) => child.toJSON()),
		};
	}
}
