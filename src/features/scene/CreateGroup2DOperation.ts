import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { Group2D } from '@pix3/runtime';
import { Vector2 } from 'three';

export interface CreateGroup2DOperationParams {
  groupName?: string;
  width?: number;
  height?: number;
  position?: Vector2;
  parentNodeId?: string | null;
}

export class CreateGroup2DOperation extends CreateNodeOperationBase<CreateGroup2DOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-group2d';
  }

  protected getMetadataTitle(): string {
    return 'Create Group2D';
  }

  protected getMetadataDescription(): string {
    return 'Create a 2D group container in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '2d', 'group', 'node', 'container'];
  }

  protected getNodeTypeName(): string {
    return 'Group2D';
  }

  protected createNode(params: CreateGroup2DOperationParams, nodeId: string) {
    const groupName = params.groupName || 'Group2D';
    const width = params.width ?? 100;
    const height = params.height ?? 100;
    const node = new Group2D({
      id: nodeId,
      name: groupName,
      width,
      height,
      position: params.position,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
