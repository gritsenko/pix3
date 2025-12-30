import { Color, PointLight } from 'three';
import { Node3D, type Node3DProps } from '@/nodes/Node3D';
import type { PropertySchema } from '@/fw/property-schema';

export interface PointLightNodeProps extends Omit<Node3DProps, 'type'> {
  color?: string;
  intensity?: number;
  distance?: number;
  decay?: number;
}

export class PointLightNode extends Node3D {
  readonly light: PointLight;

  constructor(props: PointLightNodeProps) {
    super(props, 'PointLight');
    const color = new Color(props.color ?? '#ffffff').convertSRGBToLinear();
    const intensity = typeof props.intensity === 'number' ? props.intensity : 1;
    const distance = typeof props.distance === 'number' ? props.distance : 0;
    const decay = typeof props.decay === 'number' ? props.decay : 2;

    this.light = new PointLight(color, intensity, distance, decay);
    this.light.castShadow = true;
    this.add(this.light);
  }

  static override getPropertySchema(): PropertySchema {
    return {
      ...super.getPropertySchema(),
      color: {
        name: 'color',
        label: 'Color',
        type: 'string',
        group: 'Light',
        getValue: (node: PointLightNode) => '#' + node.light.color.getHexString(),
        setValue: (node: PointLightNode, value: string) => {
          node.light.color.set(value).convertSRGBToLinear();
        },
      },
      intensity: {
        name: 'intensity',
        label: 'Intensity',
        type: 'number',
        group: 'Light',
        uiHints: { step: 0.1, precision: 2 },
        getValue: (node: PointLightNode) => node.light.intensity,
        setValue: (node: PointLightNode, value: number) => {
          node.light.intensity = value;
        },
      },
      distance: {
        name: 'distance',
        label: 'Range',
        type: 'number',
        group: 'Light',
        uiHints: { step: 0.1, precision: 2 },
        getValue: (node: PointLightNode) => node.light.distance,
        setValue: (node: PointLightNode, value: number) => {
          node.light.distance = value;
        },
      },
      decay: {
        name: 'decay',
        label: 'Decay',
        type: 'number',
        group: 'Light',
        uiHints: { step: 0.1, precision: 2 },
        getValue: (node: PointLightNode) => node.light.decay,
        setValue: (node: PointLightNode, value: number) => {
          node.light.decay = value;
        },
      },
      castShadow: {
        name: 'castShadow',
        label: 'Cast Shadow',
        type: 'boolean',
        group: 'Light',
        getValue: (node: PointLightNode) => node.light.castShadow,
        setValue: (node: PointLightNode, value: boolean) => {
          node.light.castShadow = value;
        },
      },
    };
  }
}
