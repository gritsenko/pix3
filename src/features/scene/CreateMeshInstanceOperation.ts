import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import { MeshInstance, type SceneGraph } from '@pix3/runtime';

export interface CreateMeshInstanceOperationParams {
  meshName?: string;
  src?: string | null; // res:// or templ:// path to .glb/.gltf
}

export class CreateMeshInstanceOperation extends CreateNodeOperationBase<CreateMeshInstanceOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-mesh-instance';
  }

  protected getMetadataTitle(): string {
    return 'Create Mesh Instance';
  }

  protected getMetadataDescription(): string {
    return 'Create a 3D mesh instance in the scene';
  }

  protected getMetadataTags(): string[] {
    return ['scene', '3d', 'mesh', 'node', 'model'];
  }

  protected getNodeTypeName(): string {
    return 'MeshInstance';
  }

  protected createNode(params: CreateMeshInstanceOperationParams, nodeId: string) {
    const meshName = params.meshName || 'Mesh Instance';
    const src = params.src ?? null;
    const node = new MeshInstance({
      id: nodeId,
      name: meshName,
      src,
    });
    return node as SceneGraph['rootNodes'][0];
  }
}
