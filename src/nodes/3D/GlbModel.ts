import { Node3D, type Node3DProps } from '@/nodes/Node3D';

export interface GlbModelProps extends Omit<Node3DProps, 'type'> {
  src?: string | null; // res:// or http(s) path to .glb/.gltf
}

export class GlbModel extends Node3D {
  readonly src: string | null;

  constructor(props: GlbModelProps) {
    super(props, 'GlbModel');
    this.src = props.src ?? null;
    // Note: actual GLB loading is handled by rendering/services layer; this node only stores metadata.
  }

  override get treeColor(): string {
    return '#a0e9a0'; // green-ish for models
  }

  override get treeIcon(): string {
    return 'package';
  }
}
