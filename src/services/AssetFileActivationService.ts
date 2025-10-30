import { injectable, inject } from '@/fw/di';
import { CommandDispatcher } from '@/services/CommandDispatcher';
import { LoadSceneCommand } from '@/features/scene/LoadSceneCommand';
import { AddModelCommand } from '@/features/scene/AddModelCommand';

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
    const { extension, resourcePath, name } = payload;
    if (!resourcePath) return;

    if (extension === 'pix3scene') {
      const sceneId = this.deriveSceneId(resourcePath);
      const command = new LoadSceneCommand({ filePath: resourcePath, sceneId });
      await this.commandDispatcher.execute(command);
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
