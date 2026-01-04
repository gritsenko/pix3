import { injectable, inject } from '@/fw/di';
import { CommandDispatcher } from '@/services/CommandDispatcher';
import { LoadSceneCommand } from '@/features/scene/LoadSceneCommand';
import { AddModelCommand } from '@/features/scene/AddModelCommand';
import { CreateSprite2DCommand } from '@/features/scene/CreateSprite2DCommand';
import { SceneManager } from '@/core/SceneManager';
import { LayoutManagerService } from '@/core/LayoutManager';
import type { SceneGraph } from '@/core/SceneManager';

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
export class AssetFileActivationService {
  private static readonly SUPPORTED_IMAGE_EXTENSIONS = new Set([
    'png',
    'jpg',
    'jpeg',
    'webm',
    'aif',
  ]);
  private static readonly UI_LAYER_NAME = 'UI Layer';

  @inject(CommandDispatcher)
  private readonly commandDispatcher!: CommandDispatcher;

  @inject(SceneManager)
  private readonly sceneManager!: SceneManager;

  @inject(LayoutManagerService)
  private readonly layoutManager!: LayoutManagerService;

  /**
   * Handle activation of an asset file from the project tree.
   * @param payload File activation details including extension and resource path
   */
  async handleActivation(payload: AssetActivation): Promise<void> {
    const { extension, resourcePath, name } = payload;
    if (!resourcePath) return;

    if (AssetFileActivationService.SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
      await this.handleImageAsset(payload);
      return;
    }

    if (extension === 'pix3scene' || extension === 'pix3node') {
      const sceneId = this.deriveSceneId(resourcePath);
      
      // Load the scene into memory
      const command = new LoadSceneCommand({ filePath: resourcePath, sceneId });
      await this.commandDispatcher.execute(command);
      
      // Open in a new viewport tab
      this.layoutManager.openSceneTab(sceneId, name);
      return;
    }

    if (extension === 'glb' || extension === 'gltf') {
      const command = new AddModelCommand({ modelPath: resourcePath, modelName: name });
      await this.commandDispatcher.execute(command);
      return;
    }

    // TODO: other asset types (images -> Sprite2D, audio, prefabs, etc.)
    console.info('[AssetFileActivationService] No handler for asset type', payload);
  }

  private async handleImageAsset(payload: AssetActivation): Promise<void> {
    const sceneGraph = this.sceneManager.getActiveSceneGraph();
    if (!sceneGraph) {
      console.warn(
        '[AssetFileActivationService] Cannot create sprite without an active scene',
        payload
      );
      return;
    }

    const uiLayer = this.findUiLayer(sceneGraph);
    if (!uiLayer) {
      console.info(
        '[AssetFileActivationService] UI layer missing, sprite will be added to root',
        payload
      );
    }

    const command = new CreateSprite2DCommand({
      spriteName: this.deriveSpriteName(payload.name),
      texturePath: payload.resourcePath,
      parentNodeId: uiLayer?.nodeId ?? null,
    });

    await this.commandDispatcher.execute(command);
  }

  private findUiLayer(sceneGraph: SceneGraph) {
    // Look in the children of the root SceneNode
    return sceneGraph.rootNode.children.find(
      (node: any) => node.type === 'Group2D' && node.name === AssetFileActivationService.UI_LAYER_NAME
    );
  }

  private deriveSpriteName(fileName: string): string {
    const stripped = fileName.replace(/\.[^./]+$/, '').trim();
    return stripped || 'Sprite2D';
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

injectable()(AssetFileActivationService);
