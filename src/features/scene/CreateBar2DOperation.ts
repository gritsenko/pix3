import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { Bar2D } from '@pix3/runtime';
import { Vector2 } from 'three';

export interface CreateBar2DOperationParams {
  barName?: string;
  width?: number;
  height?: number;
  position?: Vector2;
  parentNodeId?: string | null;
}

export class CreateBar2DOperation extends CreateNodeOperationBase<CreateBar2DOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-bar2d';
  }

  protected getMetadataTitle(): string {
    return 'Create Bar2D';
  }

  protected getMetadataDescription(): string {
    return 'Create a 2D bar (progress/HP/energy) in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '2d', 'bar', 'node', 'ui'];
  }

  protected getNodeTypeName(): string {
    return 'Bar2D';
  }

  protected createNode(params: CreateBar2DOperationParams, nodeId: string) {
    const barName = params.barName || 'Bar2D';
    const node = new Bar2D({
      id: nodeId,
      name: barName,
      position: params.position || new Vector2(100, 100),
      width: params.width,
      height: params.height,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
