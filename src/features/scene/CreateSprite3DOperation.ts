import { Sprite3D } from '@pix3/runtime';
import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';

export interface CreateSprite3DOperationParams {
  spriteName?: string;
  width?: number;
  height?: number;
  texturePath?: string | null;
  billboard?: boolean;
  billboardRoll?: number;
}

export class CreateSprite3DOperation extends CreateNodeOperationBase<CreateSprite3DOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-sprite3d';
  }

  protected getMetadataTitle(): string {
    return 'Create Sprite3D';
  }

  protected getMetadataDescription(): string {
    return 'Create a 3D sprite in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '3d', 'sprite', 'node'];
  }

  protected getNodeTypeName(): string {
    return 'Sprite3D';
  }

  protected createNode(params: CreateSprite3DOperationParams, nodeId: string) {
    const spriteName = params.spriteName || 'Sprite3D';
    const texturePath = params.texturePath ?? null;
    const node = new Sprite3D({
      id: nodeId,
      name: spriteName,
      width: params.width,
      height: params.height,
      texturePath,
      billboard: params.billboard,
      billboardRoll: params.billboardRoll,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
