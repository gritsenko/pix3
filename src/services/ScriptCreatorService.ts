import { injectable, inject } from '@/fw/di';
import { FileSystemAPIService } from './FileSystemAPIService';
import { ProjectScriptLoaderService } from './ProjectScriptLoaderService';

export interface ScriptCreationParams {
  scriptName: string;
  scriptType: 'behavior' | 'controller';
}

export interface ScriptCreationInstance {
  id: string;
  params: ScriptCreationParams;
  resolve: (scriptName: string | null) => void;
  reject: (error: Error) => void;
}

@injectable()
export class ScriptCreatorService {
  @inject(FileSystemAPIService)
  private readonly fs!: FileSystemAPIService;

  @inject(ProjectScriptLoaderService)
  private readonly scriptLoader!: ProjectScriptLoaderService;

  private creators = new Map<string, ScriptCreationInstance>();
  private nextId = 0;
  private listeners = new Set<(creators: ScriptCreationInstance[]) => void>();

  /**
   * Show the script creator dialog and return a promise that resolves to the created script name or null if cancelled.
   */
  public async showCreator(params: ScriptCreationParams): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const id = `creator-${this.nextId++}`;
      const instance: ScriptCreationInstance = {
        id,
        params,
        resolve: (scriptName: string | null) => {
          this.creators.delete(id);
          this.notifyListeners();
          resolve(scriptName);
        },
        reject: (error: Error) => {
          this.creators.delete(id);
          this.notifyListeners();
          reject(error);
        },
      };

      this.creators.set(id, instance);
      this.notifyListeners();
    });
  }

  /**
   * Get all active creators for rendering
   */
  public getCreators(): ScriptCreationInstance[] {
    return Array.from(this.creators.values());
  }

  /**
   * Subscribe to creator changes
   */
  public subscribe(listener: (creators: ScriptCreationInstance[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Confirm script creation
   */
  public async confirm(creatorId: string, scriptName: string): Promise<void> {
    const instance = this.creators.get(creatorId);
    if (!instance) return;

    try {
      // Create the script file
      const fileName = `${scriptName}.ts`;
      const filePath = `scripts/${fileName}`;
      
      // Generate script template
      const template = this.generateScriptTemplate(scriptName, instance.params.scriptType);
      
      // Ensure scripts directory exists
      try {
        await this.fs.createDirectory('scripts');
      } catch (error) {
        // Directory might already exist, that's ok
        console.log('[ScriptCreator] Scripts directory already exists or created');
      }
      
      // Write the script file
      await this.fs.writeTextFile(filePath, template);
      
      // Trigger script compilation
      await this.scriptLoader.syncAndBuild();
      
      // Resolve with the created script name
      instance.resolve(scriptName);
    } catch (error) {
      console.error('[ScriptCreator] Failed to create script:', error);
      instance.reject(error as Error);
    }
  }

  /**
   * Cancel script creation
   */
  public cancel(creatorId: string): void {
    const instance = this.creators.get(creatorId);
    if (instance) {
      instance.resolve(null);
    }
  }

  /**
   * Generate a script template based on type
   */
  private generateScriptTemplate(scriptName: string, scriptType: 'behavior' | 'controller'): string {
    const baseClass = scriptType === 'controller' ? 'ScriptControllerBase' : 'BehaviorBase';
    const typeLabel = scriptType === 'controller' ? 'Controller' : 'Behavior';

    return `/**
 * ${scriptName}${typeLabel} - Auto-generated script
 *
 * ${scriptType === 'controller' ? 'Controller for node logic' : 'Reusable behavior component'}
 */

import { ${baseClass} } from '@/core/ScriptComponent';
import type { PropertySchema } from '@/fw';

export class ${scriptName}${typeLabel} extends ${baseClass} {
  constructor(id: string, type: string) {
    super(id, type);
    // Initialize default parameters
    this.parameters = {
      // Add your parameters here
    };
  }

  static getPropertySchema(): PropertySchema {
    return {
      nodeType: '${scriptName}${typeLabel}',
      properties: [
        // Add property definitions here
        // Example:
        // {
        //   name: 'speed',
        //   type: 'number',
        //   ui: {
        //     label: 'Speed',
        //     description: 'Movement speed',
        //     group: '${typeLabel}',
        //     min: 0,
        //     max: 10,
        //     step: 0.1,
        //   },
        //   getValue: (script: unknown) => (script as ${scriptName}${typeLabel}).parameters.speed,
        //   setValue: (script: unknown, value: unknown) => {
        //     (script as ${scriptName}${typeLabel}).parameters.speed = Number(value);
        //   },
        // },
      ],
      groups: {
        ${typeLabel}: {
          label: '${typeLabel} Parameters',
          description: 'Configuration for ${scriptName.toLowerCase()} ${scriptType}',
          expanded: true,
        },
      },
    };
  }

  onAttach(): void {
    console.log(\`[${scriptName}${typeLabel}] Attached to node "\${this.node?.name}" (\${this.node?.nodeId})\`);
    // Initialize script when attached to a node
  }

  onStart(): void {
    console.log(\`[${scriptName}${typeLabel}] Starting on node "\${this.node?.name}"\`);
    // Called on the first frame after attachment
  }

  onUpdate(dt: number): void {
    // Called every frame with delta time in seconds
    // Implement your update logic here
  }

  onDetach(): void {
    console.log(\`[${scriptName}${typeLabel}] Detached from node "\${this.node?.name}"\`);
    // Clean up resources when detached
  }
}
`;
  }

  private notifyListeners(): void {
    const creators = this.getCreators();
    for (const listener of this.listeners) {
      listener(creators);
    }
  }

  public dispose(): void {
    this.creators.clear();
    this.listeners.clear();
  }
}
