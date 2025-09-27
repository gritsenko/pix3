import { NodeBase, type NodeBaseProps } from './NodeBase';

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Node3DProps extends Omit<NodeBaseProps, 'type'> {
  position?: Partial<Vector3>;
  rotation?: Partial<Vector3>;
  scale?: Partial<Vector3>;
}

const DEFAULT_POSITION = { x: 0, y: 0, z: 0 } satisfies Vector3;
const DEFAULT_ROTATION = { x: 0, y: 0, z: 0 } satisfies Vector3;
const DEFAULT_SCALE = { x: 1, y: 1, z: 1 } satisfies Vector3;

export class Node3D extends NodeBase {
  readonly position: Vector3;
  readonly rotation: Vector3;
  readonly scale: Vector3;

  constructor(props: Node3DProps, parent: NodeBase | null = null) {
    super({ ...props, type: 'Node3D' }, parent);
    this.position = { ...DEFAULT_POSITION, ...props.position };
    this.rotation = { ...DEFAULT_ROTATION, ...props.rotation };
    this.scale = { ...DEFAULT_SCALE, ...props.scale };
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      position: this.position,
      rotation: this.rotation,
      scale: this.scale,
    };
  }
}
