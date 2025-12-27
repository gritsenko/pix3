import { Color, SpotLight } from 'three';
import { Node3D, type Node3DProps } from '@/nodes/Node3D';
import type { PropertySchema } from '@/fw/property-schema';

export interface SpotLightNodeProps extends Omit<Node3DProps, 'type'> {
  color?: string;
  intensity?: number;
  distance?: number;
  angle?: number;
  penumbra?: number;
  decay?: number;
}

export class SpotLightNode extends Node3D {
  readonly light: SpotLight;

  constructor(props: SpotLightNodeProps) {
    super(props, 'SpotLight');
    const color = new Color(props.color ?? '#ffffff').convertSRGBToLinear();
    const intensity = typeof props.intensity === 'number' ? props.intensity : 1;
    const distance = typeof props.distance === 'number' ? props.distance : 0;
    const angle = typeof props.angle === 'number' ? props.angle : Math.PI / 3;
    const penumbra = typeof props.penumbra === 'number' ? props.penumbra : 0;
    const decay = typeof props.decay === 'number' ? props.decay : 2;

    this.light = new SpotLight(color, intensity, distance, angle, penumbra, decay);
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
        getValue: (node: SpotLightNode) => '#' + node.light.color.getHexString(),
        setValue: (node: SpotLightNode, value: string) => {
          node.light.color.set(value).convertSRGBToLinear();
        },
      },
      intensity: {
        name: 'intensity',
        label: 'Intensity',
        type: 'number',
        group: 'Light',
        uiHints: { step: 0.1, precision: 2 },
        getValue: (node: SpotLightNode) => node.light.intensity,
        setValue: (node: SpotLightNode, value: number) => {
          node.light.intensity = value;
        },
      },
      distance: {
        name: 'distance',
        label: 'Range',
        type: 'number',
        group: 'Light',
        uiHints: { step: 0.1, precision: 2 },
        getValue: (node: SpotLightNode) => node.light.distance,
        setValue: (node: SpotLightNode, value: number) => {
          node.light.distance = value;
        },
      },
      angle: {
        name: 'angle',
        label: 'Angle',
        type: 'number',
        group: 'Light',
        uiHints: { unit: '°', step: 0.1, precision: 1 },
        getValue: (node: SpotLightNode) => (node.light.angle * 180) / Math.PI,
        setValue: (node: SpotLightNode, value: number) => {
          node.light.angle = (value * Math.PI) / 180;
        },
      },
      penumbra: {
        name: 'penumbra',
        label: 'Penumbra',
        type: 'number',
        group: 'Light',
        uiHints: { step: 0.01, precision: 2 },
        getValue: (node: SpotLightNode) => node.light.penumbra,
        setValue: (node: SpotLightNode, value: number) => {
          node.light.penumbra = value;
        },
      },
      decay: {
        name: 'decay',
        label: 'Decay',
        type: 'number',
        group: 'Light',
        uiHints: { step: 0.1, precision: 2 },
        getValue: (node: SpotLightNode) => node.light.decay,
        setValue: (node: SpotLightNode, value: number) => {
          node.light.decay = value;
        },
      },
      castShadow: {
        name: 'castShadow',
        label: 'Cast Shadow',
        type: 'boolean',
        group: 'Light',
        getValue: (node: SpotLightNode) => node.light.castShadow,
        setValue: (node: SpotLightNode, value: boolean) => {
          node.light.castShadow = value;
        },
      },
    };
  }
}
