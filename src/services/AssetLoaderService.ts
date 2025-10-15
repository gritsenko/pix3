import { injectable, inject } from '@/fw/di';
import { OperationService } from '@/core/OperationService';
import { LoadSceneOperation } from '@/features/scene/LoadSceneOperation';

export interface AssetActivation {
  name: string;
  path: string;
  kind: FileSystemHandleKind;
  resourcePath: string | null;
  extension: string; // lowercase without dot
}

@injectable()
export class AssetLoaderService {
  @inject(OperationService)
  private readonly operations!: OperationService;

  async handleActivation(payload: AssetActivation): Promise<void> {
    const { extension, resourcePath } = payload;
    if (!resourcePath) return;

    if (extension === 'pix3scene') {
      const sceneId = this.deriveSceneId(resourcePath);
      await this.operations.invoke(new LoadSceneOperation({ filePath: resourcePath, sceneId }));
      return;
    }

    if (extension === 'glb' || extension === 'gltf') {
      return;
    }

    // TODO: other asset types (images -> Sprite2D, audio, prefabs, etc.)
    console.info('[AssetLoaderService] No handler for asset type', payload);
  }

  private deriveSceneId(resourcePath: string): string {
    const withoutScheme = resourcePath.replace(/^res:\/\//i, '').replace(/^templ:\/\//i, '');
    const withoutExtension = withoutScheme.replace(/\.[^./]+$/i, '');
    const normalized = withoutExtension
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return normalized || 'scene';
  }
}
