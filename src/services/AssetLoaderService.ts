import { injectable, inject } from '@/fw/di';
import { OperationService } from '@/services/OperationService';
import { LoadSceneOperation } from '@/features/scene/LoadSceneOperation';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Object3D, AnimationClip } from 'three';

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

  async loadGltfToMeshInstance(src: string): Promise<{ scene: Object3D; animations: AnimationClip[] } | null> {
    try {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(src);
      const clonedScene = SkeletonUtils.clone(gltf.scene);
      const clonedAnimations = gltf.animations.map((clip: AnimationClip) => clip.clone());
      return { scene: clonedScene, animations: clonedAnimations };
    } catch (error) {
      console.error(`Failed to load GLTF: ${src}`, error);
      return null;
    }
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
