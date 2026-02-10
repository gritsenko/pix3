import { PerspectiveCamera, OrthographicCamera, Camera, Vector3, Quaternion } from 'three';
import { Node3D, type Node3DProps } from '../Node3D';
import type { PropertySchema } from '../../fw/property-schema';
import { defineProperty, mergeSchemas } from '../../fw/property-schema';

export const TARGET_DISTANCE = 10;

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

  getTargetPosition(): Vector3 {
    const forward = new Vector3(0, 0, -1);
    forward.applyQuaternion(this.quaternion);
    return forward.multiplyScalar(TARGET_DISTANCE).add(this.position);
  }

  setTargetPosition(targetPos: Vector3): void {
    const direction = targetPos.clone().sub(this.position).normalize();
    const quaternion = new Quaternion();
    quaternion.setFromUnitVectors(new Vector3(0, 0, -1), direction);
    this.quaternion.copy(quaternion);
  }

  static override getPropertySchema(): PropertySchema {
    const base = super.getPropertySchema();

    const cameraProps = {
      nodeType: 'Camera3D',
      properties: [
        defineProperty('fov', 'number', {
          ui: { label: 'Field of View', group: 'Camera', unit: '°', step: 0.1, precision: 1 },
          getValue: (node: unknown) => ((node as Camera3D).camera as PerspectiveCamera).fov ?? 60,
          setValue: (node: unknown, value: unknown) => {
            const n = node as Camera3D;
            if (n.camera instanceof PerspectiveCamera) {
              n.camera.fov = Number(value);
              (n.camera as PerspectiveCamera).updateProjectionMatrix();
            }
          },
        }),
        defineProperty('near', 'number', {
          ui: { label: 'Near Plane', group: 'Camera', step: 0.01, precision: 2 },
          getValue: (node: unknown) => {
            const n = node as Camera3D;
            return (n.camera as PerspectiveCamera | OrthographicCamera).near;
          },
          setValue: (node: unknown, value: unknown) => {
            const n = node as Camera3D;
            if (n.camera instanceof PerspectiveCamera || n.camera instanceof OrthographicCamera) {
              (n.camera as PerspectiveCamera | OrthographicCamera).near = Number(value);
              (n.camera as PerspectiveCamera | OrthographicCamera).updateProjectionMatrix?.();
            }
          },
        }),
        defineProperty('far', 'number', {
          ui: { label: 'Far Plane', group: 'Camera', step: 1, precision: 0 },
          getValue: (node: unknown) => {
            const n = node as Camera3D;
            return (n.camera as PerspectiveCamera | OrthographicCamera).far;
          },
          setValue: (node: unknown, value: unknown) => {
            const n = node as Camera3D;
            if (n.camera instanceof PerspectiveCamera || n.camera instanceof OrthographicCamera) {
              (n.camera as PerspectiveCamera | OrthographicCamera).far = Number(value);
              (n.camera as PerspectiveCamera | OrthographicCamera).updateProjectionMatrix?.();
            }
          },
        }),
      ],
      groups: {
        Camera: { label: 'Camera', expanded: true },
      },
    } as PropertySchema;

    return mergeSchemas(base, cameraProps);
  }
}
