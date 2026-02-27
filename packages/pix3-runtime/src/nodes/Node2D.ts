import { MathUtils, type Material, Vector2 } from 'three';

import { NodeBase, type NodeBaseProps } from './NodeBase';
import type { PropertySchema } from '../fw/property-schema';
import { LAYER_2D } from '../constants';

export interface Node2DProps extends Omit<NodeBaseProps, 'type'> {
  position?: Vector2;
  scale?: Vector2;
  rotation?: number; // degrees
  opacity?: number;
}

export class Node2D extends NodeBase {
  private _opacity: number;
  private _computedOpacity: number;
  private readonly opacityMaterials: Set<Material> = new Set();

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

    this._opacity = Node2D.clampOpacity(props.opacity ?? 1);
    this._computedOpacity = this._opacity;
    if (props.opacity !== undefined || typeof this.properties.opacity === 'number') {
      this.properties.opacity = this._opacity;
    }
  }

  get opacity(): number {
    return this._opacity;
  }

  set opacity(value: number) {
    const nextOpacity = Node2D.clampOpacity(value);
    if (this._opacity === nextOpacity) {
      return;
    }

    this._opacity = nextOpacity;
    this.properties.opacity = nextOpacity;
    this.refreshComputedOpacityRecursive();
  }

  get computedOpacity(): number {
    return this._computedOpacity;
  }

  protected registerOpacityMaterial(material: Material, baseOpacity?: number): void {
    if (baseOpacity !== undefined) {
      material.userData.__pix3BaseOpacity = Node2D.clampOpacity(baseOpacity);
    } else if (typeof material.userData.__pix3BaseOpacity !== 'number') {
      material.userData.__pix3BaseOpacity = Node2D.clampOpacity(material.opacity);
    }

    if (material.userData.__pix3OriginalTransparent === undefined) {
      material.userData.__pix3OriginalTransparent = material.transparent;
    }

    this.opacityMaterials.add(material);
    this.applyOpacityToMaterial(material);
  }

  protected setOpacityMaterialBase(material: Material, baseOpacity: number): void {
    material.userData.__pix3BaseOpacity = Node2D.clampOpacity(baseOpacity);
    
    if (material.userData.__pix3OriginalTransparent === undefined) {
      material.userData.__pix3OriginalTransparent = material.transparent;
    }

    this.opacityMaterials.add(material);
    this.applyOpacityToMaterial(material);
  }

  private applyOpacityToMaterial(material: Material): void {
    const baseOpacityRaw = material.userData.__pix3BaseOpacity;
    const baseOpacity =
      typeof baseOpacityRaw === 'number'
        ? Node2D.clampOpacity(baseOpacityRaw)
        : Node2D.clampOpacity(material.opacity);
    material.opacity = baseOpacity * this._computedOpacity;
    
    const originalTransparent = material.userData.__pix3OriginalTransparent;
    material.transparent = originalTransparent || material.opacity < 1;
    material.needsUpdate = true;
  }

  public refreshOpacity(): void {
    this.refreshComputedOpacityRecursive();
  }

  private getParentComputedOpacity(): number {
    return this.parent instanceof Node2D ? this.parent.computedOpacity : 1;
  }

  private refreshComputedOpacityRecursive(): void {
    this._computedOpacity = this._opacity * this.getParentComputedOpacity();

    for (const material of this.opacityMaterials) {
      this.applyOpacityToMaterial(material);
    }

    for (const child of this.children) {
      if (child instanceof Node2D) {
        child.refreshComputedOpacityRecursive();
      }
    }
  }

  private static clampOpacity(value: number): number {
    const safe = Number.isFinite(value) ? value : 1;
    return Math.max(0, Math.min(1, safe));
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

      if (obj instanceof Node2D) {
        obj.refreshComputedOpacityRecursive();
      }
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
        {
          name: 'opacity',
          type: 'number',
          ui: {
            label: 'Opacity',
            description: 'Local opacity multiplier inherited by child 2D nodes',
            group: 'Style',
            step: 0.01,
            precision: 2,
            min: 0,
            max: 1,
          },
          getValue: (node: unknown) => (node as Node2D).opacity,
          setValue: (node: unknown, value: unknown) => {
            (node as Node2D).opacity = Number(value);
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
        Style: {
          label: 'Style',
          description: '2D visual styling properties',
          expanded: false,
        },
      },
    };
  }
}
