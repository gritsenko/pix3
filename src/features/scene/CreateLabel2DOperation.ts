import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { Label2D } from '@pix3/runtime';
import { Vector2 } from 'three';

export interface CreateLabel2DOperationParams {
  labelName?: string;
  text?: string;
  position?: Vector2;
  parentNodeId?: string | null;
}

export class CreateLabel2DOperation extends CreateNodeOperationBase<CreateLabel2DOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-label2d';
  }

  protected getMetadataTitle(): string {
    return 'Create Label2D';
  }

  protected getMetadataDescription(): string {
    return 'Create a 2D label in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '2d', 'label', 'node', 'ui'];
  }

  protected getNodeTypeName(): string {
    return 'Label2D';
  }

  protected createNode(params: CreateLabel2DOperationParams, nodeId: string) {
    const labelName = params.labelName || 'Label2D';
    const node = new Label2D({
      id: nodeId,
      name: labelName,
      label: params.text || 'New Label',
      position: params.position || new Vector2(100, 100),
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
