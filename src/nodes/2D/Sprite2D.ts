import { Node2D, type Node2DProps } from '@/nodes/Node2D';
import type { PropertySchema } from '@/fw';

export interface Sprite2DProps extends Omit<Node2DProps, 'type'> {
  texturePath?: string | null;
  width?: number;
  height?: number;
}

export class Sprite2D extends Node2D {
  readonly texturePath: string | null;
  /** Width in pixels. Defaults to texture width when loaded, or 64 as placeholder. */
  width: number;
  /** Height in pixels. Defaults to texture height when loaded, or 64 as placeholder. */
  height: number;

  constructor(props: Sprite2DProps) {
    super(props, 'Sprite2D');
    this.texturePath = props.texturePath ?? null;
    this.width = props.width ?? 64;
    this.height = props.height ?? 64;
    this.isContainer = false;
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
        {
          name: 'width',
          type: 'number',
          ui: {
            label: 'Width',
            description: 'Sprite width in pixels',
            group: 'Size',
            step: 1,
            precision: 0,
            min: 1,
            unit: 'px',
          },
          getValue: (node: unknown) => (node as Sprite2D).width,
          setValue: (node: unknown, value: unknown) => {
            (node as Sprite2D).width = Number(value);
          },
        },
        {
          name: 'height',
          type: 'number',
          ui: {
            label: 'Height',
            description: 'Sprite height in pixels',
            group: 'Size',
            step: 1,
            precision: 0,
            min: 1,
            unit: 'px',
          },
          getValue: (node: unknown) => (node as Sprite2D).height,
          setValue: (node: unknown, value: unknown) => {
            (node as Sprite2D).height = Number(value);
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
        Size: {
          label: 'Size',
          description: 'Sprite dimensions in pixels',
          expanded: true,
        },
      },
    };
  }
}
