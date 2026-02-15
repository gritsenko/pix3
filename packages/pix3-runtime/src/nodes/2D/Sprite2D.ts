import { Mesh, MeshBasicMaterial, PlaneGeometry, Texture } from 'three';
import { Node2D, type Node2DProps } from '../Node2D';
import type { PropertySchema } from '../../fw/property-schema';

export interface Sprite2DProps extends Omit<Node2DProps, 'type'> {
  texturePath?: string | null;
  width?: number;
  height?: number;
  color?: string;
}

export class Sprite2D extends Node2D {
  readonly texturePath: string | null;
  /** Width in pixels. Defaults to texture width when loaded, or 64 as placeholder. */
  width: number | undefined;
  /** Height in pixels. Defaults to texture height when loaded, or 64 as placeholder. */
  height: number | undefined;

  private mesh: Mesh;
  private geometry: PlaneGeometry;
  private material: MeshBasicMaterial;

  constructor(props: Sprite2DProps) {
    super(props, 'Sprite2D');
    this.texturePath = props.texturePath ?? null;
    this.width = props.width ?? 64;
    this.height = props.height ?? 64;
    this.isContainer = false;

    // Create visuals
    this.geometry = new PlaneGeometry(this.width, this.height);
    this.material = new MeshBasicMaterial({
      color: props.color ?? '#ffffff',
      transparent: true,
      depthTest: false,
    });

    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = `${this.name}-Mesh`;
    this.add(this.mesh);
  }

  /**
   * Set the texture for this sprite.
   * Resizes the mesh if the texture provides dimensions and width/height were not specified.
   */
  setTexture(texture: Texture): void {
    console.log(`[Sprite2D] setTexture called for "${this.name}"`, texture);

    // Set color space for proper rendering
    if ('colorSpace' in texture) {
      (texture as any).colorSpace = 'srgb';
    } else if ('encoding' in texture) {
      (texture as any).encoding = 3001; // sRGBEncoding
    }

    this.material.map = texture;
    this.material.color.set('#ffffff'); // Reset to white once texture is loaded
    this.material.needsUpdate = true;

    // If no explicit dimensions, use texture dimensions
    if (texture.image && (this.width === undefined || this.height === undefined)) {
      const w = (texture.image as HTMLImageElement).width;
      const h = (texture.image as HTMLImageElement).height;
      console.log(`[Sprite2D] Auto-resizing "${this.name}" to texture dimensions: ${w}x${h}`);
      if (w && h) {
        this.updateSize(w, h);
      }
    }
  }

  private updateSize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.geometry.dispose();
    this.geometry = new PlaneGeometry(w, h);
    this.mesh.geometry = this.geometry;
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
          getValue: (node: unknown) => (node as Sprite2D).width ?? 64,
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
          getValue: (node: unknown) => (node as Sprite2D).height ?? 64,
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
