import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { DirectionalLightNode } from '@pix3/runtime';
import { Vector3 } from 'three';

export interface CreateDirectionalLightOperationParams {
  lightName?: string;
  color?: string;
  intensity?: number;
  position?: Vector3;
}

export class CreateDirectionalLightOperation extends CreateNodeOperationBase<CreateDirectionalLightOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-directional-light';
  }

  protected getMetadataTitle(): string {
    return 'Create Directional Light';
  }

  protected getMetadataDescription(): string {
    return 'Create a directional light in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '3d', 'light', 'node'];
  }

  protected getNodeTypeName(): string {
    return 'DirectionalLight';
  }

  protected createNode(params: CreateDirectionalLightOperationParams, nodeId: string) {
    const lightName = params.lightName || 'Directional Light';
    const color = params.color ?? '#ffffff';
    const intensity = params.intensity ?? 1;
    const node = new DirectionalLightNode({
      id: nodeId,
      name: lightName,
      color,
      intensity,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
