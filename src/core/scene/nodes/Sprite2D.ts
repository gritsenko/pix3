import { NodeBase, type NodeBaseProps } from './NodeBase';

export interface Vector2 {
  x: number;
  y: number;
}

export interface Sprite2DProps extends Omit<NodeBaseProps, 'type'> {
  position?: Partial<Vector2>;
  scale?: Partial<Vector2>;
  rotation?: number;
  texturePath?: string | null;
}

const DEFAULT_POSITION: Vector2 = { x: 0, y: 0 };
const DEFAULT_SCALE: Vector2 = { x: 1, y: 1 };

export class Sprite2D extends NodeBase {
  readonly position: Vector2;
  readonly scale: Vector2;
  readonly rotation: number;
  readonly texturePath: string | null;

  constructor(props: Sprite2DProps, parent: NodeBase | null = null) {
    super({ ...props, type: 'Sprite2D' }, parent);
    this.position = { ...DEFAULT_POSITION, ...props.position };
    this.scale = { ...DEFAULT_SCALE, ...props.scale };
    this.rotation = props.rotation ?? 0;
    this.texturePath = props.texturePath ?? null;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      position: this.position,
      scale: this.scale,
      rotation: this.rotation,
      texturePath: this.texturePath ?? undefined,
    };
  }
}
