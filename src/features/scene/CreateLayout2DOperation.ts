import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { Layout2D } from '@pix3/runtime';

export interface CreateLayout2DOperationParams {
  width?: number;
  height?: number;
}

export class CreateLayout2DOperation extends CreateNodeOperationBase<CreateLayout2DOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-layout2d';
  }

  protected getMetadataTitle(): string {
    return 'Create Layout2D';
  }

  protected getMetadataDescription(): string {
    return 'Create a new Layout2D root node';
  }

  protected getMetadataTags(): string[] {
    return ['scene', 'layout2d', 'viewport', 'node', 'container'];
  }

  protected getNodeTypeName(): string {
    return 'Layout2D';
  }

  protected createNode(params: CreateLayout2DOperationParams, nodeId: string) {
    const width = params.width ?? 1920;
    const height = params.height ?? 1080;
    const node = new Layout2D({
      id: nodeId,
      name: '2D Layout',
      width,
      height,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
