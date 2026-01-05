import { inject, injectable } from '@/fw/di';
import { ResourceManager } from '@/services/ResourceManager';
import { MeshInstance } from '@/nodes/3D/MeshInstance';
import { NodeBase } from '@/nodes/NodeBase';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AnimationClip } from 'three';

export interface AssetLoaderResult {
  node: NodeBase;
}

/**
 * AssetLoader is responsible for loading asset files from res:// or templ:// URLs
 * and converting them to concrete NodeBase instances in the scene tree.
 *
 * Supported formats:
 * - .glb / .gltf → MeshInstance
 * - (TODO) .png / .jpg → Sprite2D
 * - (TODO) .mp3 / .ogg → AudioNode
 */
@injectable()
export class AssetLoader {
  @inject(ResourceManager)
  private readonly resources!: ResourceManager;

  /**
   * Load an asset file and return a NodeBase instance.
   * @param resourcePath res:// or templ:// path to the asset file
   * @param nodeId Optional node ID; generates UUID if not provided
   * @param nodeName Optional node name; defaults to asset filename
   * @returns Loaded asset as a NodeBase instance
   */
  async loadAsset(
    resourcePath: string,
    nodeId?: string,
    nodeName?: string
  ): Promise<AssetLoaderResult> {
    const extension = this.getExtension(resourcePath);

    switch (extension) {
      case 'glb':
      case 'gltf':
        return this.loadGltfAsMeshInstance(resourcePath, nodeId, nodeName);

      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'webp':
        throw new Error(`[AssetLoader] Image loading not yet implemented: ${resourcePath}`);

      case 'mp3':
      case 'ogg':
      case 'wav':
        throw new Error(`[AssetLoader] Audio loading not yet implemented: ${resourcePath}`);

      default:
        throw new Error(`[AssetLoader] Unsupported asset type: ${extension}`);
    }
  }

  /**
   * Load a GLB/GLTF file and convert it to a MeshInstance node.
   * @param resourcePath res:// or templ:// path to the .glb/.gltf file
   * @param nodeId Optional node ID; generates UUID if not provided
   * @param nodeName Optional node name; defaults to 'mesh' if not provided
   * @returns MeshInstance node with loaded geometry and animations
   */
  private async loadGltfAsMeshInstance(
    resourcePath: string,
    nodeId?: string,
    nodeName?: string
  ): Promise<AssetLoaderResult> {
    try {
      const blob = await this.resources.readBlob(resourcePath);
      const arrayBuffer = await blob.arrayBuffer();

      const loader = new GLTFLoader();

      // Use parse() instead of loadAsync() with an empty resource path
      // This prevents GLTFLoader from trying to resolve external resources
      const gltf = await new Promise<GLTF>((resolve, reject) => {
        loader.parse(
          arrayBuffer,
          '', // Empty resource path - all data is embedded in GLB
          result => resolve(result as GLTF),
          error => reject(error)
        );
      });

      const animations = gltf.animations.map((clip: AnimationClip) => clip.clone());

      const finalNodeId = nodeId || crypto.randomUUID();
      const finalNodeName = nodeName || 'mesh';

      const meshInstance = new MeshInstance({
        id: finalNodeId,
        name: finalNodeName,
        src: resourcePath,
      });

      // Add loaded geometry to the instance
      meshInstance.add(gltf.scene);
      meshInstance.animations = animations;

      return { node: meshInstance };
    } catch (error) {
      console.error(`[AssetLoader] Failed to load GLTF: ${resourcePath}`, error);
      throw new Error(
        `Failed to load asset: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Extract file extension from resource path.
   */
  private getExtension(resourcePath: string): string {
    const match = resourcePath.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : '';
  }

  dispose(): void {
    // No resources to clean up
  }
}
