import { Node3D, type Node3DProps } from '@/nodes/Node3D';
import { AnimationClip } from 'three';

export interface MeshInstanceProps extends Omit<Node3DProps, 'type'> {
  src?: string | null; // res:// or templ:// path to .glb/.gltf
}

export class MeshInstance extends Node3D {
  readonly src: string | null;
  animations: AnimationClip[] = [];

  constructor(props: MeshInstanceProps) {
    super(props, 'MeshInstance');
    this.src = props.src ?? null;
  }
}
