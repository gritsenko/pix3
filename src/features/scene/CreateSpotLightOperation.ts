import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { SpotLightNode, type SceneGraph } from '@pix3/runtime';
import { Vector3 } from 'three';

export interface CreateSpotLightOperationParams {
  lightName?: string;
  color?: string;
  intensity?: number;
  distance?: number;
  angle?: number;
  penumbra?: number;
  decay?: number;
  position?: Vector3;
}

export class CreateSpotLightOperation extends CreateNodeOperationBase<CreateSpotLightOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-spot-light';
  }

  protected getMetadataTitle(): string {
    return 'Create Spot Light';
  }

  protected getMetadataDescription(): string {
    return 'Create a spot light in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '3d', 'light', 'node'];
  }

  protected getNodeTypeName(): string {
    return 'SpotLight';
  }

  protected createNode(params: CreateSpotLightOperationParams, nodeId: string) {
    const lightName = params.lightName || 'Spot Light';
    const color = params.color ?? '#ffffff';
    const intensity = params.intensity ?? 1;
    const distance = params.distance ?? 0;
    const angle = params.angle ?? Math.PI / 3;
    const penumbra = params.penumbra ?? 0;
    const decay = params.decay ?? 2;
    const node = new SpotLightNode({
      id: nodeId,
      name: lightName,
      color,
      intensity,
      distance,
      angle,
      penumbra,
      decay,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
