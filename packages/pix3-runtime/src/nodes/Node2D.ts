import { MathUtils, Vector2 } from 'three';

import { NodeBase, type NodeBaseProps } from './NodeBase';
import type { PropertySchema } from '../fw/property-schema';
import { LAYER_2D } from '../constants';

export interface Node2DProps extends Omit<NodeBaseProps, 'type'> {
  position?: Vector2;
  scale?: Vector2;
  rotation?: number; // degrees
}

export class Node2D extends NodeBase {
  constructor(props: Node2DProps, nodeType: string = 'Node2D') {
    super({ ...props, type: nodeType });

    this.layers.set(LAYER_2D);

    const position = props.position ?? new Vector2(0, 0);
    this.position.set(position.x, position.y, 0);

    const scale = props.scale ?? new Vector2(1, 1);
    this.scale.set(scale.x, scale.y, 1);

    const rotationDegrees = props.rotation ?? 0;
    const rotationRadians = MathUtils.degToRad(rotationDegrees);
    this.rotation.set(0, 0, rotationRadians);
  }

  /**
   * Override add to ensure all children of a Node2D inherit the 2D layer.
   */
  add(...object: import('three').Object3D[]): this {
    super.add(...object);

    // Enforce layer on all added objects and their descendants
    for (const obj of object) {
      obj.traverse((child) => {
        child.layers.set(LAYER_2D);
      });
    }

    return this;
  }

  /**
   * Get the property schema for Node2D.
   * Extends NodeBase schema with 2D-specific transform properties.
   */
  static getPropertySchema(): PropertySchema {
    const baseSchema = NodeBase.getPropertySchema();

    return {
      nodeType: 'Node2D',
      extends: 'NodeBase',
      properties: [
        ...baseSchema.properties,
        {
          name: 'position',
          type: 'vector2',
          ui: {
            label: 'Position',
            group: 'Transform',
            step: 0.01,
            precision: 2,
          },
          getValue: (node: unknown) => {
            const n = node as Node2D;
            return { x: n.position.x, y: n.position.y };
          },
          setValue: (node: unknown, value: unknown) => {
            const n = node as Node2D;
            const v = value as { x: number; y: number };
            n.position.x = v.x;
            n.position.y = v.y;
          },
        },
        {
          name: 'rotation',
          type: 'number',
          ui: {
            label: 'Rotation',
            description: 'Z-axis rotation',
            group: 'Transform',
            step: 0.1,
            precision: 1,
            unit: '°',
          },
          getValue: (node: unknown) => {
            const n = node as Node2D;
            return n.rotation.z * (180 / Math.PI); // Convert radians to degrees
          },
          setValue: (node: unknown, value: unknown) => {
            const n = node as Node2D;
            n.rotation.z = Number(value) * (Math.PI / 180); // Convert degrees to radians
          },
        },
        {
          name: 'scale',
          type: 'vector2',
          ui: {
            label: 'Scale',
            group: 'Transform',
            step: 0.01,
            precision: 2,
            min: 0,
          },
          getValue: (node: unknown) => {
            const n = node as Node2D;
            return { x: n.scale.x, y: n.scale.y };
          },
          setValue: (node: unknown, value: unknown) => {
            const n = node as Node2D;
            const v = value as { x: number; y: number };
            n.scale.x = v.x;
            n.scale.y = v.y;
          },
        },
      ],
      groups: {
        ...baseSchema.groups,
        Transform: {
          label: 'Transform',
          description: '2D position, rotation, and scale',
          expanded: true,
        },
      },
    };
  }
}
