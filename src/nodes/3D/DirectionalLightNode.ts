import { Color, DirectionalLight } from 'three';
import { Node3D, type Node3DProps } from '@/nodes/Node3D';

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
}
