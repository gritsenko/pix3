import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { Camera3D } from '@pix3/runtime';
import { Vector3 } from 'three';

export interface CreateCamera3DOperationParams {
  cameraName?: string;
  projection?: 'perspective' | 'orthographic';
  fov?: number;
  orthographicSize?: number;
  position?: Vector3;
}

export class CreateCamera3DOperation extends CreateNodeOperationBase<CreateCamera3DOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-camera3d';
  }

  protected getMetadataTitle(): string {
    return 'Create Camera3D';
  }

  protected getMetadataDescription(): string {
    return 'Create a 3D camera in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '3d', 'camera', 'node'];
  }

  protected getNodeTypeName(): string {
    return 'Camera3D';
  }

  protected createNode(params: CreateCamera3DOperationParams, nodeId: string) {
    const cameraName = params.cameraName || 'Camera3D';
    const projection = params.projection ?? 'perspective';
    const fov = params.fov ?? 60;
    const orthographicSize = params.orthographicSize ?? 5;
    const node = new Camera3D({
      id: nodeId,
      name: cameraName,
      projection,
      fov,
      orthographicSize,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
