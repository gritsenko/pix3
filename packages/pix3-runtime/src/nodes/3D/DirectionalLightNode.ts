import { Color, DirectionalLight, Vector3, Quaternion } from 'three';
import { Node3D, type Node3DProps } from '../Node3D';
import type { PropertySchema } from '../../fw/property-schema';
import { defineProperty, mergeSchemas } from '../../fw/property-schema';

const TARGET_DISTANCE = 5;

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
    this.light.position.set(0, 0, 0);
    this.add(this.light);
    this.add(this.light.target);

    const initialTarget = this.getWorldPosition(new Vector3()).add(
      new Vector3(0, 0, TARGET_DISTANCE).applyQuaternion(this.getWorldQuaternion(new Quaternion()))
    );
    this.setTargetPosition(initialTarget);
  }

  getTargetPosition(): Vector3 {
    this.light.target.updateMatrixWorld(true);
    return this.light.target.getWorldPosition(new Vector3());
  }

  setTargetPosition(targetPos: Vector3): void {
    const worldPosition = this.getWorldPosition(new Vector3());
    const rawDirection = targetPos.clone().sub(worldPosition);
    const direction =
      rawDirection.lengthSq() > 1e-8
        ? rawDirection.normalize()
        : new Vector3(0, 0, 1).applyQuaternion(this.getWorldQuaternion(new Quaternion()));
    const constrainedTarget = worldPosition.add(direction.multiplyScalar(TARGET_DISTANCE));

    this.lookAt(constrainedTarget);

    const localTarget = constrainedTarget.clone();
    this.worldToLocal(localTarget);
    this.light.target.position.copy(localTarget);
    this.light.target.updateMatrixWorld(true);
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
