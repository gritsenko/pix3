import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { AnimatedSprite3D, type SceneGraph } from '@pix3/runtime';
import { Vector3 } from 'three';

export interface CreateAnimatedSprite3DOperationParams {
  nodeName?: string;
  position?: Vector3;
  parentNodeId?: string | null;
}

export class CreateAnimatedSprite3DOperation extends CreateNodeOperationBase<CreateAnimatedSprite3DOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-animatedsprite3d';
  }

  protected getMetadataTitle(): string {
    return 'Create AnimatedSprite3D';
  }

  protected getMetadataDescription(): string {
    return 'Create a 3D animated sprite in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '3d', 'animated', 'sprite', 'node'];
  }

  protected getNodeTypeName(): string {
    return 'AnimatedSprite3D';
  }

  protected createNode(params: CreateAnimatedSprite3DOperationParams, nodeId: string) {
    const nodeName = params.nodeName || 'AnimatedSprite3D';
    const node = new AnimatedSprite3D({
      id: nodeId,
      name: nodeName,
      position: params.position || new Vector3(0, 0, 0),
      width: 1,
      height: 1,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
