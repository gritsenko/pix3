import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { Checkbox2D, type SceneGraph } from '@pix3/runtime';
import { Vector2 } from 'three';

export interface CreateCheckbox2DOperationParams {
  checkboxName?: string;
  size?: number;
  position?: Vector2;
  parentNodeId?: string | null;
}

export class CreateCheckbox2DOperation extends CreateNodeOperationBase<CreateCheckbox2DOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-checkbox2d';
  }

  protected getMetadataTitle(): string {
    return 'Create Checkbox2D';
  }

  protected getMetadataDescription(): string {
    return 'Create a 2D checkbox in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '2d', 'checkbox', 'node', 'ui'];
  }

  protected getNodeTypeName(): string {
    return 'Checkbox2D';
  }

  protected createNode(params: CreateCheckbox2DOperationParams, nodeId: string) {
    const checkboxName = params.checkboxName || 'Checkbox2D';
    const node = new Checkbox2D({
      id: nodeId,
      name: checkboxName,
      position: params.position || new Vector2(100, 100),
      size: params.size,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
