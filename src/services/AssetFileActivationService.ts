import { injectable, inject } from '@/fw/di';
import { CommandDispatcher } from '@/services/CommandDispatcher';
import { LoadSceneCommand } from '@/features/scene/LoadSceneCommand';
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

/**
 * AssetFileActivationService handles opening asset files from the project tree.
 * It dispatches appropriate commands based on file type (e.g., LoadSceneCommand for .pix3scene files).
 */
@injectable()
export class AssetFileActivationService {
  @inject(CommandDispatcher)
  private readonly commandDispatcher!: CommandDispatcher;

  /**
   * Handle activation of an asset file from the project tree.
   * @param payload File activation details including extension and resource path
   */
  async handleActivation(payload: AssetActivation): Promise<void> {
    const { extension, resourcePath } = payload;
    if (!resourcePath) return;

    if (extension === 'pix3scene') {
      const sceneId = this.deriveSceneId(resourcePath);
      const command = new LoadSceneCommand({ filePath: resourcePath, sceneId });
      await this.commandDispatcher.execute(command);
      return;
    }

    if (extension === 'glb' || extension === 'gltf') {
      return;
    }

    // TODO: other asset types (images -> Sprite2D, audio, prefabs, etc.)
    console.info('[AssetFileActivationService] No handler for asset type', payload);
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

  async loadGltfFromBlob(blob: Blob): Promise<{ scene: Object3D; animations: AnimationClip[] } | null> {
    try {
      const loader = new GLTFLoader();
      const url = URL.createObjectURL(blob);
      try {
        const gltf = await loader.loadAsync(url);
        const clonedScene = SkeletonUtils.clone(gltf.scene);
        const clonedAnimations = gltf.animations.map((clip: AnimationClip) => clip.clone());
        return { scene: clonedScene, animations: clonedAnimations };
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to load GLTF from blob', error);
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
