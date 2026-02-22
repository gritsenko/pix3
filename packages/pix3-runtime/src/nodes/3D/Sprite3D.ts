import {
  DoubleSide,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Texture,
} from 'three';
import { Node3D, type Node3DProps } from '../Node3D';
import type { PropertySchema } from '../../fw/property-schema';

export interface Sprite3DProps extends Omit<Node3DProps, 'type'> {
  texturePath?: string | null;
  width?: number;
  height?: number;
  color?: string;
  billboard?: boolean;
  billboardRoll?: number;
}

export class Sprite3D extends Node3D {
  texturePath: string | null;
  width: number;
  height: number;
  color: string;
  billboard: boolean;
  billboardRoll: number;

  private mesh: Mesh;
  private geometry: PlaneGeometry;
  private material: MeshBasicMaterial;
  private billboardPivot: Mesh;

  private static readonly tempWorldQuaternion = new Quaternion();
  private static readonly tempLocalQuaternion = new Quaternion();

  constructor(props: Sprite3DProps) {
    super(props, 'Sprite3D');

    this.texturePath = props.texturePath ?? null;
    this.width = typeof props.width === 'number' && props.width > 0 ? props.width : 1;
    this.height = typeof props.height === 'number' && props.height > 0 ? props.height : 1;
    this.color = props.color ?? '#ffffff';
    this.billboard = props.billboard ?? false;
    this.billboardRoll = props.billboardRoll ?? 0;

    this.geometry = new PlaneGeometry(this.width, this.height);
    this.material = new MeshBasicMaterial({
      color: this.color,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
    });

    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = `${this.name}-Mesh`;

    // Pivot used for billboarding so node transform can still define placement in world.
    this.billboardPivot = this.mesh;
    this.add(this.billboardPivot);
  }

  setTexture(texture: Texture): void {
    texture.colorSpace = SRGBColorSpace;
    this.material.map = texture;
    this.material.color.set('#ffffff');
    this.material.transparent = true;
    this.material.needsUpdate = true;
  }

  clearTexture(): void {
    this.material.map = null;
    this.material.needsUpdate = true;
  }

  setSize(width: number, height: number): void {
    const nextWidth = Number.isFinite(width) && width > 0 ? width : this.width;
    const nextHeight = Number.isFinite(height) && height > 0 ? height : this.height;

    if (nextWidth === this.width && nextHeight === this.height) {
      return;
    }

    this.width = nextWidth;
    this.height = nextHeight;

    this.geometry.dispose();
    this.geometry = new PlaneGeometry(this.width, this.height);
    this.mesh.geometry = this.geometry;
  }

  applyBillboard(cameraQuaternion: Quaternion): void {
    if (!this.billboard) {
      this.billboardPivot.quaternion.identity();
      return;
    }

    this.getWorldQuaternion(Sprite3D.tempWorldQuaternion);

    Sprite3D.tempLocalQuaternion
      .copy(Sprite3D.tempWorldQuaternion)
      .invert()
      .multiply(cameraQuaternion);

    this.billboardPivot.quaternion.copy(Sprite3D.tempLocalQuaternion);
    this.billboardPivot.rotateZ(MathUtils.degToRad(this.billboardRoll));
  }

  static getPropertySchema(): PropertySchema {
    const baseSchema = Node3D.getPropertySchema();

    return {
      nodeType: 'Sprite3D',
      extends: 'Node3D',
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
          getValue: (node: unknown) => (node as Sprite3D).texturePath ?? '',
          setValue: (node: unknown, value: unknown) => {
            const n = node as Sprite3D;
            const next = typeof value === 'string' ? value.trim() : '';
            n.texturePath = next.length > 0 ? next : null;
          },
        },
        {
          name: 'width',
          type: 'number',
          ui: {
            label: 'Width',
            description: 'Sprite width in world units',
            group: 'Sprite',
            step: 0.01,
            precision: 2,
            min: 0.01,
          },
          getValue: (node: unknown) => (node as Sprite3D).width,
          setValue: (node: unknown, value: unknown) => {
            const n = node as Sprite3D;
            n.setSize(Number(value), n.height);
          },
        },
        {
          name: 'height',
          type: 'number',
          ui: {
            label: 'Height',
            description: 'Sprite height in world units',
            group: 'Sprite',
            step: 0.01,
            precision: 2,
            min: 0.01,
          },
          getValue: (node: unknown) => (node as Sprite3D).height,
          setValue: (node: unknown, value: unknown) => {
            const n = node as Sprite3D;
            n.setSize(n.width, Number(value));
          },
        },
        {
          name: 'billboard',
          type: 'boolean',
          ui: {
            label: 'Billboard',
            description: 'Face the active camera while keeping world placement',
            group: 'Sprite',
          },
          getValue: (node: unknown) => (node as Sprite3D).billboard,
          setValue: (node: unknown, value: unknown) => {
            (node as Sprite3D).billboard = !!value;
          },
        },
        {
          name: 'billboardRoll',
          type: 'number',
          ui: {
            label: 'Billboard Roll',
            description: 'Additional roll angle when billboard is enabled',
            group: 'Sprite',
            step: 0.1,
            precision: 1,
            unit: '°',
          },
          getValue: (node: unknown) => (node as Sprite3D).billboardRoll,
          setValue: (node: unknown, value: unknown) => {
            (node as Sprite3D).billboardRoll = Number(value);
          },
        },
      ],
      groups: {
        ...baseSchema.groups,
        Sprite: {
          label: 'Sprite',
          description: '3D sprite rendering properties',
          expanded: true,
        },
      },
    };
  }
}
