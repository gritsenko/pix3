import { NodeBase } from '../NodeBase';
import { Node2D, type Node2DProps } from './Node2D';

export interface Sprite2DProps extends Omit<Node2DProps, 'type'> {
  texturePath?: string | null;
}

export class Sprite2D extends Node2D {
  readonly texturePath: string | null;

  constructor(props: Sprite2DProps, parent: NodeBase | null = null) {
    super({ ...props, type: 'Sprite2D' }, parent);
    this.texturePath = props.texturePath ?? null;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      texturePath: this.texturePath ?? undefined,
    };
  }
}
