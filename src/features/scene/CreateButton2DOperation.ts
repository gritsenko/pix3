import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { Button2D, type SceneGraph } from '@pix3/runtime';
import { Vector2 } from 'three';

export interface CreateButton2DOperationParams {
  buttonName?: string;
  width?: number;
  height?: number;
  position?: Vector2;
  parentNodeId?: string | null;
}

export class CreateButton2DOperation extends CreateNodeOperationBase<CreateButton2DOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-button2d';
  }

  protected getMetadataTitle(): string {
    return 'Create Button2D';
  }

  protected getMetadataDescription(): string {
    return 'Create a 2D button in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '2d', 'button', 'node', 'ui'];
  }

  protected getNodeTypeName(): string {
    return 'Button2D';
  }

  protected createNode(params: CreateButton2DOperationParams, nodeId: string) {
    const buttonName = params.buttonName || 'Button2D';
    const node = new Button2D({
      id: nodeId,
      name: buttonName,
      position: params.position || new Vector2(100, 100),
      width: params.width,
      height: params.height,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
