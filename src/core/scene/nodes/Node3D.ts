import { Euler, Vector3 } from 'three';

import { NodeBase, type NodeBaseProps } from './NodeBase';

export interface Node3DProps extends Omit<NodeBaseProps, 'type'> {
  position?: Vector3;
  rotation?: Euler;
  rotationOrder?: Euler['order'];
  scale?: Vector3;
}

export class Node3D extends NodeBase {
  constructor(props: Node3DProps, nodeType: string = 'Node3D') {
    super({ ...props, type: nodeType });

    if (props.position) {
      this.position.copy(props.position);
    }

    if (props.rotation) {
      this.rotation.copy(props.rotation);
    } else {
      this.rotation.set(0, 0, 0);
    }

    this.rotation.order = props.rotationOrder ?? this.rotation.order;

    if (props.scale) {
      this.scale.copy(props.scale);
    }
  }

  get treeColor(): string {
    return '#fe9ebeff'; // pink
  }

  get treeIcon(): string {
    return 'cube';
  }
}
