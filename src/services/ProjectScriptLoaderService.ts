import { injectable, inject } from '@/fw/di';
import { subscribe } from 'valtio/vanilla';

import { appState } from '@/state';
import { Script } from '@/core/ScriptComponent';

import { FileSystemAPIService } from './FileSystemAPIService';
import { ScriptRegistry } from './ScriptRegistry';
import { ScriptCompilerService } from './ScriptCompilerService';
import type { CompilationError } from './ScriptCompilerService';
import { FileWatchService } from './FileWatchService';
import { LoggingService } from './LoggingService';

/**
 * ProjectScriptLoaderService
 *
 * Manages the lifecycle of user-authored scripts in the project's scripts/ directory.
 * This service:
 * 1. Watches for changes to .ts files in the scripts/ directory
 * 2. Compiles scripts using ScriptCompilerService (esbuild-wasm)
 * 3. Dynamically imports the compiled bundle
 * 4. Registers script classes in ScriptRegistry for use in the editor
 *
 * The compilation process is debounced to avoid excessive rebuilds during editing.
 */

@injectable()
export class ProjectScriptLoaderService {
  @inject(FileSystemAPIService)
  private readonly fs!: FileSystemAPIService;

  @inject(ScriptRegistry)
  private readonly scriptRegistry!: ScriptRegistry;

  @inject(ScriptCompilerService)
  private readonly compiler!: ScriptCompilerService;

  @inject(FileWatchService)
  private readonly _fileWatch!: FileWatchService; // Injected to ensure service initialization

  @inject(LoggingService)
  private readonly logger!: LoggingService;

  private disposeSubscription?: () => void;
  private debounceTimer: number | null = null;
  private readonly debounceMs = 300;

  // Track scripts from this project for cleanup
  private registeredScriptIds = new Set<string>();

  // Disable auto-compilation for MVP - handled by external compiler
  enableAutoCompilation = false;

  constructor() {
    // Watch for project status changes to trigger initial compilation
    this.disposeSubscription = subscribe(appState.project, () => {
      if (appState.project.status === 'ready' && this.enableAutoCompilation) {
        void this.syncAndBuild();
      }
    });
  }

  /**
   * Main workflow: Scan scripts directory, compile, and register.
   * This method is debounced to avoid excessive rebuilds.
   */
  async syncAndBuild(): Promise<void> {
    // Clear existing debounce timer
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }

    // Debounce the build
    this.debounceTimer = window.setTimeout(() => {
      void this.performSyncAndBuild();
    }, this.debounceMs);
  }

  /**
   * Perform the actual sync and build workflow
   */
  private async performSyncAndBuild(): Promise<void> {
    try {
      this.logger.info('Compiling project scripts...');

      // Step 1: List all .ts files in scripts/ directory
      const entries = await this.fs.listDirectory('scripts');
      const tsFiles = entries.filter(e => e.kind === 'file' && e.name.endsWith('.ts'));

      if (tsFiles.length === 0) {
        this.logger.info('No TypeScript files found in scripts/ directory');
        this.clearRegisteredScripts();
        return;
      }

      this.logger.info(`Found ${tsFiles.length} script file(s), compiling...`);

      // Step 2: Read file contents into a Map
      const filesMap = new Map<string, string>();
      for (const file of tsFiles) {
        try {
          const content = await this.fs.readTextFile(file.path);
          filesMap.set(file.path, content);
        } catch (error) {
          this.logger.error(`Failed to read ${file.path}`, error);
        }
      }

      if (filesMap.size === 0) {
        this.logger.warn('No script files could be read');
        return;
      }

      // Step 3: Compile scripts using ScriptCompilerService
      let compilationResult;
      try {
        compilationResult = await this.compiler.bundle(filesMap);
      } catch (error) {
        this.handleCompilationError(error as CompilationError);
        return;
      }

      // Step 4: Load the compiled bundle
      await this.loadBundle(compilationResult.code);

      this.logger.info(`✓ Scripts compiled and loaded successfully`);
    } catch (error) {
      this.logger.error('Failed to compile scripts', error);
    }
  }

  /**
   * Load a compiled JavaScript bundle and register its exports
   */
  private async loadBundle(code: string): Promise<void> {
    if (!code || code.trim().length === 0) {
      console.log('[ProjectScriptLoader] Empty bundle, nothing to load');
      return;
    }

    // Create a blob URL from the compiled code
    const blob = new Blob([code], { type: 'application/javascript' });
    const blobUrl = URL.createObjectURL(blob);

    try {
      // Dynamically import the module
      const module = await import(/* @vite-ignore */ blobUrl);

      // Clear previously registered scripts
      this.clearRegisteredScripts();

      // Iterate through exports and register script classes
      for (const [exportName, exported] of Object.entries(module)) {
        if (typeof exported === 'object' && exported !== null) {
          // Each export is a namespace containing the classes from that file
          for (const [className, classValue] of Object.entries(exported)) {
            this.tryRegisterScriptClass(className, classValue, exportName);
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to load compiled bundle', error);
      throw error;
    } finally {
      // Clean up blob URL
      URL.revokeObjectURL(blobUrl);
    }
  }

  /**
   * Try to register a class as a Script component
   */
  private tryRegisterScriptClass(className: string, classValue: unknown, sourceFile: string): void {
    // Check if it's a class constructor
    if (typeof classValue !== 'function') {
      return;
    }

    const ctor = classValue as any;

    // Check if it has getPropertySchema static method (our marker for script classes)
    if (typeof ctor.getPropertySchema !== 'function') {
      return;
    }

    // Check if it extends Script by checking prototype chain
    const isScript = this.isSubclassOf(ctor, Script);

    if (!isScript) {
      console.warn(
        `[ProjectScriptLoader] ${className} has getPropertySchema but doesn't extend Script`
      );
      return;
    }

    // Create unique ID for this script
    const scriptId = `project:${sourceFile}:${className}`;

    this.scriptRegistry.registerComponent({
      id: scriptId,
      displayName: className,
      description: `Project component from ${sourceFile}`,
      category: 'Project',
      componentClass: ctor,
      keywords: ['project', 'component', className.toLowerCase(), sourceFile.toLowerCase()],
    });
    this.registeredScriptIds.add(scriptId);
    this.logger.info(`Registered component: ${className}`);
  }

  /**
   * Check if a constructor is a subclass of a base class
   */
  private isSubclassOf(ctor: any, baseClass: any): boolean {
    try {
      return ctor.prototype instanceof baseClass || ctor === baseClass;
    } catch {
      return false;
    }
  }

  /**
   * Clear all scripts registered by this service
   */
  private clearRegisteredScripts(): void {
    for (const scriptId of this.registeredScriptIds) {
      this.scriptRegistry.unregisterComponent(scriptId);
    }
    this.registeredScriptIds.clear();
  }

  /**
   * Handle compilation errors by logging and displaying to user
   */
  private handleCompilationError(error: CompilationError): void {
    const location = error.file
      ? `${error.file}:${error.line ?? '?'}:${error.column ?? '?'}`
      : 'unknown location';

    const errorMessage = `Compilation failed at ${location}: ${error.message}`;
    this.logger.error(errorMessage, error.details);
  }

  dispose(): void {
    this.disposeSubscription?.();

    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.clearRegisteredScripts();
  }
}
