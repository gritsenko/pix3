import { injectable, inject } from '@/fw/di';
import { CommandDispatcher } from '@/services/CommandDispatcher';
import { AddModelCommand } from '@/features/scene/AddModelCommand';
import { CreateSprite2DCommand } from '@/features/scene/CreateSprite2DCommand';
import { SceneManager } from '@pix3/runtime';
import type { SceneGraph } from '@pix3/runtime';
import { EditorTabService } from '@/services/EditorTabService';
import { DialogService } from '@/services/DialogService';
import { FileSystemAPIService } from '@/services/FileSystemAPIService';
import { appState } from '@/state';
import { OpenProjectSettingsCommand } from '@/features/project/OpenProjectSettingsCommand';

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
  static readonly SUPPORTED_IMAGE_EXTENSIONS = new Set([
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

  @inject(EditorTabService)
  private readonly editorTabService!: EditorTabService;

  @inject(DialogService)
  private readonly dialogService!: DialogService;

  @inject(FileSystemAPIService)
  private readonly fileSystem!: FileSystemAPIService;

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

    if (extension === 'pix3scene') {
      await this.editorTabService.focusOrOpenScene(resourcePath);
      return;
    }

    if (extension === 'glb' || extension === 'gltf') {
      const command = new AddModelCommand({ modelPath: resourcePath, modelName: name });
      await this.commandDispatcher.execute(command);
      return;
    }

    if (extension === 'ts') {
      await this.handleScriptActivation(payload);
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

  private async handleScriptActivation(payload: AssetActivation): Promise<void> {
    const { resourcePath } = payload;
    const localPath = appState.project.localAbsolutePath;

    if (!localPath) {
      const confirm = await this.dialogService.showConfirmation({
        title: 'Configure Local Project Path',
        message: 'To open script files in VS Code, you must configure the absolute local path to this project.\n\nWould you like to configure it now?',
        confirmLabel: 'Configure',
        cancelLabel: 'Later'
      });

      if (confirm) {
        await this.commandDispatcher.execute(new OpenProjectSettingsCommand());
      }
      return;
    }

    // Strip res:// and join with local path
    const relativePath = resourcePath ? this.fileSystem.normalizeResourcePath(resourcePath) : '';
    
    // Normalize slashes for the OS (VS Code handle cross-platform paths well usually, but let's be safe)
    const fullPath = `${localPath.replace(/\/$/, '')}/${relativePath.replace(/^\//, '')}`;
    
    // Open in VS Code using vscode:// protocol
    const vscodeUrl = `vscode://file/${fullPath}`;
    window.open(vscodeUrl, '_blank');
  }

  private findUiLayer(sceneGraph: SceneGraph) {
    return sceneGraph.rootNodes.find(
      node => node.type === 'Group2D' && node.name === AssetFileActivationService.UI_LAYER_NAME
    );
  }

  private deriveSpriteName(fileName: string): string {
    const stripped = fileName.replace(/\.[^./]+$/, '').trim();
    return stripped || 'Sprite2D';
  }
}

injectable()(AssetFileActivationService);
