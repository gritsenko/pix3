import { Color, DirectionalLight, Vector3, Quaternion } from 'three';
import { Node3D, type Node3DProps } from '../Node3D';
import type { PropertySchema } from '../../fw/property-schema';
import { defineProperty, mergeSchemas } from '../../fw/property-schema';

const TARGET_DISTANCE = 10;

export interface DirectionalLightNodeProps extends Omit<Node3DProps, 'type'> {
  color?: string;
  intensity?: number;
  castShadow?: boolean;
}

export class DirectionalLightNode extends Node3D {
  readonly light: DirectionalLight;

  constructor(props: DirectionalLightNodeProps) {
    super(props, 'DirectionalLight');
    const color = new Color(props.color ?? '#ffffff').convertSRGBToLinear();
    const intensity = typeof props.intensity === 'number' ? props.intensity : 1;
    this.light = new DirectionalLight(color, intensity);
    this.light.castShadow = props.castShadow ?? true;
    this.add(this.light);
  }

  getTargetPosition(): Vector3 {
    const forward = new Vector3(0, 0, -1);
    forward.applyQuaternion(this.quaternion);
    return forward.multiplyScalar(TARGET_DISTANCE).add(this.position);
  }

  setTargetPosition(targetPos: Vector3): void {
    const direction = targetPos.clone().sub(this.position).normalize();
    const quaternion = new Quaternion();
    quaternion.setFromUnitVectors(new Vector3(0, 0, -1), direction);
    this.quaternion.copy(quaternion);
  }

  static override getPropertySchema(): PropertySchema {
    const base = super.getPropertySchema();
    const props: PropertySchema = {
      nodeType: 'DirectionalLight',
      properties: [
        defineProperty('color', 'color', {
          ui: { label: 'Color', group: 'Light' },
          getValue: (n: unknown) => '#' + (n as DirectionalLightNode).light.color.getHexString(),
          setValue: (n: unknown, v: unknown) => {
            (n as DirectionalLightNode).light.color.set(String(v)).convertSRGBToLinear();
          },
        }),
        defineProperty('intensity', 'number', {
          ui: { label: 'Intensity', group: 'Light', step: 0.1, precision: 2 },
          getValue: (n: unknown) => (n as DirectionalLightNode).light.intensity,
          setValue: (n: unknown, v: unknown) => {
            (n as DirectionalLightNode).light.intensity = Number(v);
          },
        }),
        defineProperty('castShadow', 'boolean', {
          ui: { label: 'Cast Shadow', group: 'Light' },
          getValue: (n: unknown) => (n as DirectionalLightNode).light.castShadow,
          setValue: (n: unknown, v: unknown) => {
            (n as DirectionalLightNode).light.castShadow = Boolean(v);
          },
        }),
      ],
      groups: { Light: { label: 'Light', expanded: true } },
    };

    return mergeSchemas(base, props);
  }
}
