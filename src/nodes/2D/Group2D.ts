import { Vector2 } from 'three';

import { Node2D, type Node2DProps } from '@/nodes/Node2D';
import type { PropertySchema } from '@/fw';

export interface Group2DProps extends Omit<Node2DProps, 'type'> {
  width?: number;
  height?: number;
}

/**
 * Group2D is a container node with a defined size (width, height).
 * It allows positioning nested elements aligned to its edges.
 * Displayed as a rectangle in the editor.
 */
export class Group2D extends Node2D {
  width: number;
  height: number;

  constructor(props: Group2DProps) {
    super(props, 'Group2D');
    this.width = props.width ?? 100;
    this.height = props.height ?? 100;
  }

  /**
   * Returns the size of the group as a Vector2.
   */
  getSize(): Vector2 {
    return new Vector2(this.width, this.height);
  }

  /**
   * Updates the size of the group.
   */
  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  /**
   * Get the property schema for Group2D.
   * Extends Node2D schema with group-specific size properties.
   */
  static getPropertySchema(): PropertySchema {
    const baseSchema = Node2D.getPropertySchema();

    return {
      nodeType: 'Group2D',
      extends: 'Node2D',
      properties: [
        ...baseSchema.properties,
        {
          name: 'width',
          type: 'number',
          ui: {
            label: 'Width',
            group: 'Size',
            step: 0.01,
            precision: 2,
            min: 0,
          },
          getValue: (node: unknown) => (node as Group2D).width,
          setValue: (node: unknown, value: unknown) => {
            const n = node as Group2D;
            n.width = Number(value);
          },
        },
        {
          name: 'height',
          type: 'number',
          ui: {
            label: 'Height',
            group: 'Size',
            step: 0.01,
            precision: 2,
            min: 0,
          },
          getValue: (node: unknown) => (node as Group2D).height,
          setValue: (node: unknown, value: unknown) => {
            const n = node as Group2D;
            n.height = Number(value);
          },
        },
      ],
      groups: {
        ...baseSchema.groups,
        Size: {
          label: 'Size',
          description: 'Group dimensions',
          expanded: true,
        },
      },
    };
  }
}
