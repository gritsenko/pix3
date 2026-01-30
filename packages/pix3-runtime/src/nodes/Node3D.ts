import { Euler, Vector3 } from 'three';

import { NodeBase, type NodeBaseProps } from './NodeBase';
import type { PropertySchema } from '../fw/property-schema';

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
    return 'box';
  }

  /**
   * Get the property schema for Node3D.
   * Extends NodeBase schema with 3D-specific transform properties.
   */
  static getPropertySchema(): PropertySchema {
    const baseSchema = NodeBase.getPropertySchema();

    return {
      nodeType: 'Node3D',
      extends: 'NodeBase',
      properties: [
        ...baseSchema.properties,
        {
          name: 'position',
          type: 'vector3',
          ui: {
            label: 'Position',
            group: 'Transform',
            step: 0.01,
            precision: 2,
          },
          getValue: (node: unknown) => {
            const n = node as Node3D;
            return { x: n.position.x, y: n.position.y, z: n.position.z };
          },
          setValue: (node: unknown, value: unknown) => {
            const n = node as Node3D;
            const v = value as { x: number; y: number; z: number };
            n.position.x = v.x;
            n.position.y = v.y;
            n.position.z = v.z;
          },
        },
        {
          name: 'rotation',
          type: 'euler',
          ui: {
            label: 'Rotation',
            description: 'Pitch (X), Yaw (Y), Roll (Z)',
            group: 'Transform',
            step: 0.1,
            precision: 1,
            unit: '°',
          },
          getValue: (node: unknown) => {
            const n = node as Node3D;
            return {
              x: n.rotation.x * (180 / Math.PI),
              y: n.rotation.y * (180 / Math.PI),
              z: n.rotation.z * (180 / Math.PI),
            };
          },
          setValue: (node: unknown, value: unknown) => {
            const n = node as Node3D;
            const v = value as { x: number; y: number; z: number };
            n.rotation.x = v.x * (Math.PI / 180);
            n.rotation.y = v.y * (Math.PI / 180);
            n.rotation.z = v.z * (Math.PI / 180);
          },
        },
        {
          name: 'scale',
          type: 'vector3',
          ui: {
            label: 'Scale',
            group: 'Transform',
            step: 0.01,
            precision: 2,
            min: 0,
          },
          getValue: (node: unknown) => {
            const n = node as Node3D;
            return { x: n.scale.x, y: n.scale.y, z: n.scale.z };
          },
          setValue: (node: unknown, value: unknown) => {
            const n = node as Node3D;
            const v = value as { x: number; y: number; z: number };
            n.scale.x = v.x;
            n.scale.y = v.y;
            n.scale.z = v.z;
          },
        },
      ],
      groups: {
        ...baseSchema.groups,
        Transform: {
          label: 'Transform',
          description: '3D position, rotation, and scale',
          expanded: true,
        },
      },
    };
  }
}
