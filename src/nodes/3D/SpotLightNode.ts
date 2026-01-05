import { Color, SpotLight } from 'three';
import { Node3D, type Node3DProps } from '@/nodes/Node3D';
import type { PropertySchema } from '@/fw/property-schema';
import { defineProperty, mergeSchemas } from '@/fw/property-schema';

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
    const base = super.getPropertySchema();
    const props: PropertySchema = {
      nodeType: 'SpotLight',
      properties: [
        defineProperty('color', 'color', {
          ui: { label: 'Color', group: 'Light' },
          getValue: (n: unknown) => '#' + (n as SpotLightNode).light.color.getHexString(),
          setValue: (n: unknown, v: unknown) => {
            (n as SpotLightNode).light.color.set(String(v)).convertSRGBToLinear();
          },
        }),
        defineProperty('intensity', 'number', {
          ui: { label: 'Intensity', group: 'Light', step: 0.1, precision: 2 },
          getValue: (n: unknown) => (n as SpotLightNode).light.intensity,
          setValue: (n: unknown, v: unknown) => {
            (n as SpotLightNode).light.intensity = Number(v);
          },
        }),
        defineProperty('distance', 'number', {
          ui: { label: 'Range', group: 'Light', step: 0.1, precision: 2 },
          getValue: (n: unknown) => (n as SpotLightNode).light.distance,
          setValue: (n: unknown, v: unknown) => {
            (n as SpotLightNode).light.distance = Number(v);
          },
        }),
        defineProperty('angle', 'number', {
          ui: { label: 'Angle', group: 'Light', unit: '°', step: 0.1, precision: 1 },
          getValue: (n: unknown) => ((n as SpotLightNode).light.angle * 180) / Math.PI,
          setValue: (n: unknown, v: unknown) => {
            (n as SpotLightNode).light.angle = (Number(v) * Math.PI) / 180;
          },
        }),
        defineProperty('penumbra', 'number', {
          ui: { label: 'Penumbra', group: 'Light', step: 0.01, precision: 2 },
          getValue: (n: unknown) => (n as SpotLightNode).light.penumbra,
          setValue: (n: unknown, v: unknown) => {
            (n as SpotLightNode).light.penumbra = Number(v);
          },
        }),
        defineProperty('decay', 'number', {
          ui: { label: 'Decay', group: 'Light', step: 0.1, precision: 2 },
          getValue: (n: unknown) => (n as SpotLightNode).light.decay,
          setValue: (n: unknown, v: unknown) => {
            (n as SpotLightNode).light.decay = Number(v);
          },
        }),
        defineProperty('castShadow', 'boolean', {
          ui: { label: 'Cast Shadow', group: 'Light' },
          getValue: (n: unknown) => (n as SpotLightNode).light.castShadow,
          setValue: (n: unknown, v: unknown) => {
            (n as SpotLightNode).light.castShadow = Boolean(v);
          },
        }),
      ],
      groups: { Light: { label: 'Light', expanded: true } },
    };

    return mergeSchemas(base, props);
  }
}
