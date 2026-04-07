import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { InventorySlot2D, type SceneGraph } from '@pix3/runtime';
import { Vector2 } from 'three';

export interface CreateInventorySlot2DOperationParams {
  slotName?: string;
  width?: number;
  height?: number;
  position?: Vector2;
  parentNodeId?: string | null;
}

export class CreateInventorySlot2DOperation extends CreateNodeOperationBase<CreateInventorySlot2DOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-inventoryslot2d';
  }

  protected getMetadataTitle(): string {
    return 'Create InventorySlot2D';
  }

  protected getMetadataDescription(): string {
    return 'Create a 2D inventory slot in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '2d', 'inventory', 'slot', 'node', 'ui'];
  }

  protected getNodeTypeName(): string {
    return 'InventorySlot2D';
  }

  protected createNode(params: CreateInventorySlot2DOperationParams, nodeId: string) {
    const slotName = params.slotName || 'InventorySlot2D';
    const node = new InventorySlot2D({
      id: nodeId,
      name: slotName,
      position: params.position || new Vector2(100, 100),
      width: params.width,
      height: params.height,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
