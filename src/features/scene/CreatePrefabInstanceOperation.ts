import { CreateNodeOperationBase } from '@/core/CreateNodeOperationBase';
import type { OperationContext } from '@/core/Operation';
import { SceneManager, type SceneNodeDefinition } from '@pix3/runtime';
import { stringify } from 'yaml';

export interface CreatePrefabInstanceOperationParams {
  prefabPath: string;
  nodeName?: string;
  parentNodeId?: string | null;
  properties?: Record<string, unknown>;
  insertIndex?: number;
}

export class CreatePrefabInstanceOperation extends CreateNodeOperationBase<CreatePrefabInstanceOperationParams> {
  protected getMetadataId(): string {
    return 'scene.create-prefab-instance';
  }
  protected getMetadataTitle(): string {
    return 'Create Prefab Instance';
  }
  protected getMetadataDescription(): string {
    return 'Create an instance of a prefab in the scene';
  }
  protected getMetadataTags(): string[] {
    return ['scene', 'prefab', 'instance', 'node'];
  }
  protected getNodeTypeName(): string {
    return 'PrefabInstance'; // or just empty, it's not used directly
  }

  protected async createNode(
    params: CreatePrefabInstanceOperationParams,
    nodeId: string,
    context: OperationContext
  ) {
    const { state, container } = context;
    const activeSceneId = state.scenes.activeSceneId!;
    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );

    const prefabPath = this.normalizePrefabPath(params.prefabPath);
    if (!prefabPath.startsWith('res://')) {
      throw new Error('Invalid prefab path');
    }

    const definition: SceneNodeDefinition = {
      id: nodeId,
      instance: prefabPath,
      name: params.nodeName,
      properties: params.properties,
    };

    const tempDocument = {
      version: '1.0.0', // assuming this is ok since sceneGraph was accessed via state
      root: [definition],
    };

    const parsed = await sceneManager.parseScene(stringify(tempDocument), {
      filePath: state.scenes.descriptors[activeSceneId]?.filePath,
    });
    const rootNode = parsed.rootNodes[0];
    if (!rootNode) {
      throw new Error('Failed to parse prefab instance');
    }
    return rootNode;
  }

  private normalizePrefabPath(path: string): string {
    return path.replace(/\\/g, '/');
  }
}
