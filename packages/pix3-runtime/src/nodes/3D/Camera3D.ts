import { PerspectiveCamera, OrthographicCamera, Camera, Vector3, Quaternion } from 'three';
import { Node3D, type Node3DProps } from '../Node3D';
import type { PropertySchema } from '../../fw/property-schema';
import { defineProperty, mergeSchemas } from '../../fw/property-schema';

export const TARGET_DISTANCE = 3;

export interface Camera3DProps extends Omit<Node3DProps, 'type'> {
  projection?: 'perspective' | 'orthographic';
  fov?: number;
  near?: number;
  far?: number;
}

export class Camera3D extends Node3D {
  readonly camera: Camera;
  private targetDistance = TARGET_DISTANCE;

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
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
  }

  getTargetPosition(): Vector3 {
    const worldPosition = this.getWorldPosition(new Vector3());
    const worldQuaternion = this.getWorldQuaternion(new Quaternion());
    const forward = new Vector3(0, 0, -1).applyQuaternion(worldQuaternion);
    return worldPosition.add(forward.multiplyScalar(this.targetDistance));
  }

  setTargetPosition(targetPos: Vector3): void {
    const worldPosition = this.getWorldPosition(new Vector3());
    const rawDirection = targetPos.clone().sub(worldPosition);
    const nextDistance = rawDirection.length();
    if (nextDistance > 1e-6) {
      this.targetDistance = nextDistance;
    }
    const worldDirection =
      rawDirection.lengthSq() > 1e-8
        ? rawDirection.normalize()
        : new Vector3(0, 0, -1).applyQuaternion(this.getWorldQuaternion(new Quaternion()));

    const localDirection = worldDirection.clone();
    const parent = this.parent;
    if (parent) {
      const parentWorldQuaternion = parent.getWorldQuaternion(new Quaternion());
      localDirection.applyQuaternion(parentWorldQuaternion.invert());
    }
    localDirection.normalize();

    const localQuaternion = new Quaternion().setFromUnitVectors(
      new Vector3(0, 0, -1),
      localDirection
    );
    this.quaternion.copy(localQuaternion);

    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
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
