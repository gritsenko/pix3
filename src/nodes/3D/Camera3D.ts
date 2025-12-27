import { PerspectiveCamera, OrthographicCamera, Camera } from 'three';
import { Node3D, type Node3DProps } from '@/nodes/Node3D';
import type { PropertySchema } from '@/fw/property-schema';

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

  static override getPropertySchema(): PropertySchema {
    return {
      ...super.getPropertySchema(),
      fov: {
        name: 'fov',
        label: 'Field of View',
        type: 'number',
        group: 'Camera',
        uiHints: { unit: '°', step: 0.1, precision: 1 },
        getValue: (node: Camera3D) => (node.camera as PerspectiveCamera).fov ?? 60,
        setValue: (node: Camera3D, value: number) => {
          if (node.camera instanceof PerspectiveCamera) {
            node.camera.fov = value;
            node.camera.updateProjectionMatrix();
          }
        },
      },
      near: {
        name: 'near',
        label: 'Near Plane',
        type: 'number',
        group: 'Camera',
        uiHints: { step: 0.01, precision: 2 },
        getValue: (node: Camera3D) => node.camera.near,
        setValue: (node: Camera3D, value: number) => {
          node.camera.near = value;
          node.camera.updateProjectionMatrix();
        },
      },
      far: {
        name: 'far',
        label: 'Far Plane',
        type: 'number',
        group: 'Camera',
        uiHints: { step: 1, precision: 0 },
        getValue: (node: Camera3D) => node.camera.far,
        setValue: (node: Camera3D, value: number) => {
          node.camera.far = value;
          node.camera.updateProjectionMatrix();
        },
      },
    };
  }
}
