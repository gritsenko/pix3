import { Color, DirectionalLight } from 'three';
import { Node3D, type Node3DProps } from '@/nodes/Node3D';
import type { PropertySchema } from '@/fw/property-schema';

export interface DirectionalLightNodeProps extends Omit<Node3DProps, 'type'> {
  color?: string;
  intensity?: number;
}

export class DirectionalLightNode extends Node3D {
  readonly light: DirectionalLight;

  constructor(props: DirectionalLightNodeProps) {
    super(props, 'DirectionalLight');
    const color = new Color(props.color ?? '#ffffff').convertSRGBToLinear();
    const intensity = typeof props.intensity === 'number' ? props.intensity : 1;
    this.light = new DirectionalLight(color, intensity);
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
        getValue: (node: DirectionalLightNode) => '#' + node.light.color.getHexString(),
        setValue: (node: DirectionalLightNode, value: string) => {
          node.light.color.set(value).convertSRGBToLinear();
        },
      },
      intensity: {
        name: 'intensity',
        label: 'Intensity',
        type: 'number',
        group: 'Light',
        uiHints: { step: 0.1, precision: 2 },
        getValue: (node: DirectionalLightNode) => node.light.intensity,
        setValue: (node: DirectionalLightNode, value: number) => {
          node.light.intensity = value;
        },
      },
      castShadow: {
        name: 'castShadow',
        label: 'Cast Shadow',
        type: 'boolean',
        group: 'Light',
        getValue: (node: DirectionalLightNode) => node.light.castShadow,
        setValue: (node: DirectionalLightNode, value: boolean) => {
          node.light.castShadow = value;
        },
      },
    };
  }
}
