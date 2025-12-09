import { Node2D, type Node2DProps } from '@/nodes/Node2D';
import type { PropertySchema } from '@/fw';

export interface Sprite2DProps extends Omit<Node2DProps, 'type'> {
  texturePath?: string | null;
}

export class Sprite2D extends Node2D {
  readonly texturePath: string | null;

  constructor(props: Sprite2DProps) {
    super(props, 'Sprite2D');
    this.texturePath = props.texturePath ?? null;
  }

  /**
   * Get the property schema for Sprite2D.
   * Extends Node2D schema with sprite-specific properties.
   */
  static getPropertySchema(): PropertySchema {
    const baseSchema = Node2D.getPropertySchema();

    return {
      nodeType: 'Sprite2D',
      extends: 'Node2D',
      properties: [
        ...baseSchema.properties,
        {
          name: 'texturePath',
          type: 'string',
          ui: {
            label: 'Texture',
            description: 'Path to the sprite texture',
            group: 'Sprite',
          },
          getValue: (node: unknown) => (node as Sprite2D).texturePath ?? '',
          setValue: () => {
            // Texture path is read-only in constructor, but would be updated via operations
            // This is here for completeness; actual updates happen via UpdateObjectPropertyOperation
          },
        },
      ],
      groups: {
        ...baseSchema.groups,
        Sprite: {
          label: 'Sprite',
          description: 'Sprite-specific properties',
          expanded: true,
        },
      },
    };
  }
}
