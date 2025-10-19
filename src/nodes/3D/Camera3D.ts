import { PerspectiveCamera, OrthographicCamera, Camera } from 'three';
import { Node3D, type Node3DProps } from '@/nodes/Node3D';

export interface Camera3DProps extends Omit<Node3DProps, 'type'> {
  projection?: 'perspective' | 'orthographic';
  fov?: number;
  near?: number;
  far?: number;
}

export class Camera3D extends Node3D {
  readonly camera: Camera;

  constructor(props: Camera3DProps) {
    super(props, 'Camera3D');

    const projection = props.projection ?? 'perspective';
    const near = props.near ?? 0.1;
    const far = props.far ?? 1000;

    if (projection === 'perspective') {
      const fov = props.fov ?? 60;
      this.camera = new PerspectiveCamera(fov, 1, near, far); // aspect will be set by viewport
    } else {
      // For orthographic, need left, right, top, bottom – for now, default
      this.camera = new OrthographicCamera(-1, 1, 1, -1, near, far);
    }

    this.add(this.camera);
  }
}
