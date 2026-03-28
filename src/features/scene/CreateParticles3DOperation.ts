import { Particles3D } from '@pix3/runtime';
import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';

export interface CreateParticles3DOperationParams {
  nodeName?: string;
}

export class CreateParticles3DOperation extends CreateNodeOperationBase<CreateParticles3DOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-particles3d';
  }

  protected getMetadataTitle(): string {
    return 'Create Particles3D';
  }

  protected getMetadataDescription(): string {
    return 'Create a 3D particle emitter node in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '3d', 'particles', 'vfx', 'node'];
  }

  protected getNodeTypeName(): string {
    return 'Particles3D';
  }

  protected createNode(params: CreateParticles3DOperationParams, nodeId: string) {
    const nodeName = params.nodeName || 'Particles3D';
    const node = new Particles3D({
      id: nodeId,
      name: nodeName,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
