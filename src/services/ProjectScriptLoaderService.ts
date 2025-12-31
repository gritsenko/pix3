import { injectable, inject } from '@/fw/di';
import { subscribe } from 'valtio/vanilla';

import { appState } from '@/state';
import { ScriptControllerBase } from '@/core/ScriptComponent';
import type { PropertySchema } from '@/fw';

import { FileSystemAPIService } from './FileSystemAPIService';
import { ScriptRegistry } from './ScriptRegistry';

/**
 * A proxy class for project-based scripts that haven't been fully loaded/compiled yet.
 * This allows them to be registered in the UI.
 */
class ProjectScriptProxy extends ScriptControllerBase {
  static getPropertySchema(): PropertySchema {
    return {
      nodeType: 'ProjectScriptProxy',
      properties: [],
      groups: {},
    };
  }

  onStart(): void {
    console.log(`[ProjectScriptProxy] Starting script: ${this.type}`);
  }

  onUpdate(_dt: number): void {
    // To be implemented: actual script execution
  }
}

@injectable()
export class ProjectScriptLoaderService {
  @inject(FileSystemAPIService)
  private readonly fs!: FileSystemAPIService;

  @inject(ScriptRegistry)
  private readonly scriptRegistry!: ScriptRegistry;

  private disposeSubscription?: () => void;

  constructor() {
    // Watch for project status changes to scan for scripts
    this.disposeSubscription = subscribe(appState.project, () => {
      if (appState.project.status === 'ready') {
        void this.scanForScripts();
      }
    });
  }

  /**
   * Scan the project's scripts/ directory for .ts files and register them.
   */
  async scanForScripts(): Promise<void> {
    try {
      const entries = await this.fs.listDirectory('scripts');
      const tsFiles = entries.filter(e => e.kind === 'file' && e.name.endsWith('.ts'));

      console.log(`[ProjectScriptLoader] Found ${tsFiles.length} scripts in scripts/`);

      for (const file of tsFiles) {
        this.registerProjectScript(file.name, file.path);
      }
    } catch (error) {
      // scripts/ directory might not exist, which is fine
      if (process.env.NODE_ENV === 'development') {
        console.debug('[ProjectScriptLoader] No scripts/ directory found or failed to list');
      }
    }
  }

  private registerProjectScript(fileName: string, filePath: string): void {
    const scriptId = filePath; // Use path as ID
    const displayName = fileName.replace('.ts', '');

    this.scriptRegistry.registerController({
      id: scriptId,
      displayName: displayName,
      description: `Project script from ${filePath}`,
      category: 'Project',
      controllerClass: ProjectScriptProxy as any,
      keywords: ['project', 'script', displayName.toLowerCase()]
    });
  }

  dispose(): void {
    this.disposeSubscription?.();
  }
}
