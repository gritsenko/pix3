import { MathUtils, Vector2 } from 'three';

import { NodeBase, type NodeBaseProps } from './NodeBase';

export interface Node2DProps extends Omit<NodeBaseProps, 'type'> {
  position?: Vector2;
  scale?: Vector2;
  rotation?: number; // degrees
}

export class Node2D extends NodeBase {
  constructor(props: Node2DProps, nodeType: string = 'Node2D') {
    super({ ...props, type: nodeType });

    const position = props.position ?? new Vector2(0, 0);
    this.position.set(position.x, position.y, 0);

    const scale = props.scale ?? new Vector2(1, 1);
    this.scale.set(scale.x, scale.y, 1);

    const rotationDegrees = props.rotation ?? 0;
    const rotationRadians = MathUtils.degToRad(rotationDegrees);
    this.rotation.set(0, 0, rotationRadians);
  }

  get treeColor(): string {
    return '#96cbf6ff'; // blue
  }
}
