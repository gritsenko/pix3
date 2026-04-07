import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { Node3D, type SceneGraph } from '@pix3/runtime';

export interface CreateNode3DOperationParams {
  nodeName?: string;
}

export class CreateNode3DOperation extends CreateNodeOperationBase<CreateNode3DOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-node3d';
  }

  protected getMetadataTitle(): string {
    return 'Create Node3D';
  }

  protected getMetadataDescription(): string {
    return 'Create an empty 3D node for grouping and organization';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '3d', 'node', 'empty', 'container', 'group'];
  }

  protected getNodeTypeName(): string {
    return 'Node3D';
  }

  protected createNode(params: CreateNode3DOperationParams, nodeId: string) {
    const nodeName = params.nodeName || 'Node3D';
    const node = new Node3D({
      id: nodeId,
      name: nodeName,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
