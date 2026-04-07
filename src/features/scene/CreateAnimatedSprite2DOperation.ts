import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { AnimatedSprite2D, type SceneGraph } from '@pix3/runtime';
import { Vector2 } from 'three';

export interface CreateAnimatedSprite2DOperationParams {
  nodeName?: string;
  position?: Vector2;
  parentNodeId?: string | null;
}

export class CreateAnimatedSprite2DOperation extends CreateNodeOperationBase<CreateAnimatedSprite2DOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-animatedsprite2d';
  }

  protected getMetadataTitle(): string {
    return 'Create AnimatedSprite2D';
  }

  protected getMetadataDescription(): string {
    return 'Create a 2D animated sprite in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '2d', 'animated', 'sprite', 'node', 'ui'];
  }

  protected getNodeTypeName(): string {
    return 'AnimatedSprite2D';
  }

  protected createNode(params: CreateAnimatedSprite2DOperationParams, nodeId: string) {
    const nodeName = params.nodeName || 'AnimatedSprite2D';
    const node = new AnimatedSprite2D({
      id: nodeId,
      name: nodeName,
      position: params.position || new Vector2(100, 100),
      width: 64,
      height: 64,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
