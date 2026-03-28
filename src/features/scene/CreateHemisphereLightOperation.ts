import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { HemisphereLightNode } from '@pix3/runtime';

export interface CreateHemisphereLightOperationParams {
  lightName?: string;
  skyColor?: string;
  groundColor?: string;
  intensity?: number;
}

export class CreateHemisphereLightOperation extends CreateNodeOperationBase<CreateHemisphereLightOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-hemisphere-light';
  }

  protected getMetadataTitle(): string {
    return 'Create Hemisphere Light';
  }

  protected getMetadataDescription(): string {
    return 'Create a hemisphere light in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '3d', 'light', 'node'];
  }

  protected getNodeTypeName(): string {
    return 'HemisphereLight';
  }

  protected createNode(params: CreateHemisphereLightOperationParams, nodeId: string) {
    const lightName = params.lightName ?? 'Hemisphere Light';
    const skyColor = params.skyColor ?? '#ffffff';
    const groundColor = params.groundColor ?? '#444444';
    const intensity = params.intensity ?? 0.5;
    const node = new HemisphereLightNode({
      id: nodeId,
      name: lightName,
      skyColor,
      groundColor,
      intensity,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
