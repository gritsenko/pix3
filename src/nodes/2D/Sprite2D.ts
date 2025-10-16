import { Node2D, type Node2DProps } from '@/nodes/Node2D';

export interface Sprite2DProps extends Omit<Node2DProps, 'type'> {
  texturePath?: string | null;
}

export class Sprite2D extends Node2D {
  readonly texturePath: string | null;

  constructor(props: Sprite2DProps) {
    super(props, 'Sprite2D');
    this.texturePath = props.texturePath ?? null;
  }
}
