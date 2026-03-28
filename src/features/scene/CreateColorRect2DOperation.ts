import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { ColorRect2D } from '@pix3/runtime';
import { Vector2 } from 'three';

export interface CreateColorRect2DOperationParams {
  nodeName?: string;
  position?: Vector2;
  parentNodeId?: string | null;
}

export class CreateColorRect2DOperation extends CreateNodeOperationBase<CreateColorRect2DOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-colorrect2d';
  }

  protected getMetadataTitle(): string {
    return 'Create ColorRect2D';
  }

  protected getMetadataDescription(): string {
    return 'Create a 2D color rectangle in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '2d', 'color', 'rect', 'node', 'ui'];
  }

  protected getNodeTypeName(): string {
    return 'ColorRect2D';
  }

  protected createNode(params: CreateColorRect2DOperationParams, nodeId: string) {
    const nodeName = params.nodeName || 'ColorRect2D';
    const node = new ColorRect2D({
      id: nodeId,
      name: nodeName,
      position: params.position || new Vector2(100, 100),
      width: 100,
      height: 100,
      color: '#ffffff',
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
