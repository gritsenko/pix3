import { Vector2 } from 'three';

import { Node2D, type Node2DProps } from '@/nodes/Node2D';

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
}
