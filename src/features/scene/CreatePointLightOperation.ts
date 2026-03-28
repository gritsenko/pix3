import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { PointLightNode } from '@pix3/runtime';
import { Vector3 } from 'three';

export interface CreatePointLightOperationParams {
  lightName?: string;
  color?: string;
  intensity?: number;
  distance?: number;
  decay?: number;
  position?: Vector3;
}

export class CreatePointLightOperation extends CreateNodeOperationBase<CreatePointLightOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-point-light';
  }

  protected getMetadataTitle(): string {
    return 'Create Point Light';
  }

  protected getMetadataDescription(): string {
    return 'Create a point light in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '3d', 'light', 'node'];
  }

  protected getNodeTypeName(): string {
    return 'PointLight';
  }

  protected createNode(params: CreatePointLightOperationParams, nodeId: string) {
    const lightName = params.lightName || 'Point Light';
    const color = params.color ?? '#ffffff';
    const intensity = params.intensity ?? 1;
    const distance = params.distance ?? 0;
    const decay = params.decay ?? 2;
    const node = new PointLightNode({
      id: nodeId,
      name: lightName,
      color,
      intensity,
      distance,
      decay,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
