import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { GeometryMesh } from '@pix3/runtime';

export interface CreateBoxOperationParams {
  boxName?: string;
  size?: [number, number, number];
  color?: string;
}

export class CreateBoxOperation extends CreateNodeOperationBase<CreateBoxOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-box';
  }

  protected getMetadataTitle(): string {
    return 'Create Box';
  }

  protected getMetadataDescription(): string {
    return 'Create a box geometry mesh in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', 'geometry', 'box', 'node'];
  }

  protected getNodeTypeName(): string {
    return 'Box';
  }

  protected createNode(params: CreateBoxOperationParams, nodeId: string) {
    const boxName = params.boxName || 'Box';
    const size = params.size ?? [1, 1, 1];
    const color = params.color ?? '#4e8df5';
    const node = new GeometryMesh({
      id: nodeId,
      name: boxName,
      geometry: 'box',
      size,
      material: { color },
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
