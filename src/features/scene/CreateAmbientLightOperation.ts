import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { AmbientLightNode } from '@pix3/runtime';

export interface CreateAmbientLightOperationParams {
  lightName?: string;
  color?: string;
  intensity?: number;
}

export class CreateAmbientLightOperation extends CreateNodeOperationBase<CreateAmbientLightOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-ambient-light';
  }

  protected getMetadataTitle(): string {
    return 'Create Ambient Light';
  }

  protected getMetadataDescription(): string {
    return 'Create an ambient light in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '3d', 'light', 'node'];
  }

  protected getNodeTypeName(): string {
    return 'AmbientLight';
  }

  protected createNode(params: CreateAmbientLightOperationParams, nodeId: string) {
    const lightName = params.lightName ?? 'Ambient Light';
    const color = params.color ?? '#ffffff';
    const intensity = params.intensity ?? 0.5;
    const node = new AmbientLightNode({ id: nodeId, name: lightName, color, intensity });
    return node as SceneGraph['rootNodes'][0];
  }
}
