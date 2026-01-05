/**
 * ScriptCompilerService
 *
 * Handles in-browser compilation of user TypeScript scripts using esbuild-wasm.
 * This service bundles user scripts into ESM modules that can be dynamically imported
 * and registered with the ScriptRegistry.
 *
 * The compilation process:
 * 1. Initialize esbuild-wasm with the WASM binary
 * 2. Accept a map of filenames to TypeScript source code
 * 3. Create a virtual entry point that exports all scripts
 * 4. Use esbuild to bundle with '@pix3/engine' marked as external
 * 5. Return the compiled JavaScript code ready for dynamic import
 */

import { injectable, inject } from '@/fw/di';
import * as esbuild from 'esbuild-wasm';
import { LoggingService } from './LoggingService';

export interface CompilationResult {
  /** Compiled JavaScript code as ESM module */
  code: string;
  /** Any warnings from the compilation */
  warnings: string[];
}

export interface CompilationError {
  message: string;
  /** File where the error occurred */
  file?: string;
  /** Line number in the file */
  line?: number;
  /** Column number in the file */
  column?: number;
  /** Full error details for debugging */
  details?: unknown;
}

@injectable()
export class ScriptCompilerService {
  @inject(LoggingService)
  private readonly logger!: LoggingService;

  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize esbuild-wasm by loading the WASM binary.
   * This must be called before any compilation can occur.
   * Safe to call multiple times - will only initialize once.
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        this.logger.info('Initializing script compiler...');
        await esbuild.initialize({
          wasmURL: '/esbuild.wasm',
          worker: true,
        });
        this.initialized = true;
        this.logger.info('Script compiler initialized successfully');
      } catch (error) {
        this.logger.error('Failed to initialize script compiler', error);
        throw new Error(`Failed to initialize script compiler: ${error}`);
      }
    })();

    return this.initPromise;
  }

  /**
   * Bundle user scripts from a virtual file system.
   * @param files Map of file paths to their TypeScript content
   * @returns Compilation result with bundled code or throws CompilationError
   */
  async bundle(files: Map<string, string>): Promise<CompilationResult> {
    if (!this.initialized) {
      await this.init();
    }

    if (files.size === 0) {
      return { code: '', warnings: [] };
    }

    // Create a virtual entry point that exports all files
    const entryPoint = this.createEntryPoint(files);

    try {
      const result = await esbuild.build({
        stdin: {
          contents: entryPoint,
          resolveDir: '/',
          sourcefile: 'entry.ts',
          loader: 'ts',
        },
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2022',
        external: ['@pix3/engine'],
        write: false,
        logLevel: 'silent',
        plugins: [this.createVirtualFileSystemPlugin(files)],
      });

      const warnings = result.warnings.map(w => this.formatMessage(w));
      const code = result.outputFiles?.[0]?.text ?? '';

      if (warnings.length > 0) {
        warnings.forEach(warning => this.logger.warn(`Script compilation warning: ${warning}`));
      }

      this.logger.info(`Scripts compiled successfully (${files.size} files, ${code.length} bytes)`);

      return { code, warnings };
    } catch (error: unknown) {
      const compilationError = this.parseCompilationError(error);
      this.logger.error(`Script compilation failed: ${compilationError.message}`, compilationError);
      throw compilationError;
    }
  }

  /**
   * Create a virtual entry point that imports and re-exports all user scripts
   */
  private createEntryPoint(files: Map<string, string>): string {
    const exports: string[] = [];

    for (const [filePath] of files) {
      // Convert file path to a valid import path
      // Remove 'scripts/' prefix if present and .ts extension
      const importPath = filePath.replace(/^scripts\//, './').replace(/\.ts$/, '');
      const exportName = this.pathToExportName(filePath);

      exports.push(`export * as ${exportName} from '${importPath}';`);
    }

    return exports.join('\n');
  }

  /**
   * Convert a file path to a valid JavaScript export name
   */
  private pathToExportName(filePath: string): string {
    // Extract filename without extension
    const filename = filePath.split('/').pop()?.replace(/\.ts$/, '') ?? 'script';
    // Replace non-alphanumeric characters with underscores
    return filename.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /**
   * Create esbuild plugin for virtual file system
   */
  private createVirtualFileSystemPlugin(files: Map<string, string>): esbuild.Plugin {
    return {
      name: 'virtual-fs',
      setup(build) {
        // Resolve file paths
        build.onResolve({ filter: /.*/ }, args => {
          // Skip external modules
          if (args.path.startsWith('@pix3/')) {
            return { path: args.path, external: true };
          }

          // Handle relative imports
          if (args.path.startsWith('./') || args.path.startsWith('../')) {
            // Normalize path and ensure it has .ts extension
            let resolvedPath = args.path;
            if (!resolvedPath.endsWith('.ts')) {
              resolvedPath += '.ts';
            }

            // Remove leading ./
            resolvedPath = resolvedPath.replace(/^\.\//, '');

            // Check if file exists in our virtual FS
            // Try with and without scripts/ prefix
            const paths = [resolvedPath, `scripts/${resolvedPath}`];

            for (const testPath of paths) {
              if (files.has(testPath)) {
                return { path: testPath, namespace: 'virtual-fs' };
              }
            }

            return {
              path: resolvedPath,
              namespace: 'virtual-fs',
            };
          }

          return { path: args.path, external: true };
        });

        // Load file contents from virtual FS
        build.onLoad({ filter: /.*/, namespace: 'virtual-fs' }, args => {
          const contents = files.get(args.path);

          if (contents === undefined) {
            return {
              errors: [
                {
                  text: `File not found: ${args.path}`,
                  location: null,
                },
              ],
            };
          }

          return {
            contents,
            loader: 'ts',
          };
        });
      },
    };
  }

  /**
   * Format an esbuild message for display
   */
  private formatMessage(message: esbuild.Message): string {
    const location = message.location
      ? `${message.location.file}:${message.location.line}:${message.location.column}`
      : 'unknown location';
    return `${location}: ${message.text}`;
  }

  /**
   * Parse esbuild error into a user-friendly CompilationError
   */
  private parseCompilationError(error: unknown): CompilationError {
    if (
      error &&
      typeof error === 'object' &&
      'errors' in error &&
      Array.isArray(error.errors) &&
      error.errors.length > 0
    ) {
      const firstError = error.errors[0];
      return {
        message: firstError.text || 'Compilation failed',
        file: firstError.location?.file,
        line: firstError.location?.line,
        column: firstError.location?.column,
        details: error,
      };
    }

    return {
      message: error.message || 'Unknown compilation error',
      details: error,
    };
  }

  /**
   * Dispose of the service (cleanup esbuild resources if needed)
   */
  dispose(): void {
    // esbuild-wasm doesn't require explicit cleanup in most cases
    // The WASM module will be garbage collected
    this.initialized = false;
    this.initPromise = null;
  }
}
