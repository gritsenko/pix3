import { inject } from '@/fw/di';
import {
  CommandBase,
  type CommandContext,
  type CommandExecutionResult,
  type CommandMetadata,
  type CommandPreconditionResult,
} from '@/core/command';
import { StandaloneBuildService } from '@/services/StandaloneBuildService';
import { DialogService } from '@/services/DialogService';
import { LoggingService } from '@/services/LoggingService';

export class BuildStandaloneCommand extends CommandBase<void, void> {
  readonly metadata: CommandMetadata = {
    id: 'project.build-standalone',
    title: 'Build Standalone',
    description: 'Generate standalone build files in the opened project',
    menuPath: 'project',
    addToMenu: true,
    menuOrder: 200,
    keywords: ['build', 'standalone', 'export', 'dist'],
  };

  @inject(StandaloneBuildService)
  private readonly standaloneBuildService!: StandaloneBuildService;

  @inject(DialogService)
  private readonly dialogService!: DialogService;

  @inject(LoggingService)
  private readonly loggingService!: LoggingService;

  preconditions(context: CommandContext): CommandPreconditionResult {
    if (context.state.project.status !== 'ready') {
      return {
        canExecute: false,
        reason: 'Project must be opened',
        scope: 'project',
      };
    }

    const hasScenes = Object.keys(context.state.scenes.descriptors).length > 0;
    if (!hasScenes) {
      return {
        canExecute: false,
        reason: 'At least one loaded scene is required',
        scope: 'scene',
      };
    }

    return { canExecute: true };
  }

  async execute(context: CommandContext): Promise<CommandExecutionResult<void>> {
    const startTime = Date.now();
    const projectName = context.state.project.projectName ?? 'Project';

    this.loggingService.info(`[Standalone Build] Starting build for "${projectName}"`);
    this.loggingService.info(`[Standalone Build] Project status: ${context.state.project.status}`);
    const sceneCount = Object.keys(context.state.scenes.descriptors).length;
    this.loggingService.info(`[Standalone Build] Scenes to export: ${sceneCount}`);

    try {
      this.loggingService.debug('[Standalone Build] Invoking build service');
      const result = await this.standaloneBuildService.buildFromTemplates(context);

      const elapsedMs = Date.now() - startTime;

      this.loggingService.info('[Standalone Build] ✓ Scaffolding generated successfully');
      this.loggingService.info(`[Standalone Build] Build Statistics:`, {
        writtenFiles: result.writtenFiles,
        createdDirectories: result.createdDirectories,
        scenes: result.sceneCount,
        assets: result.assetCount,
        packageJsonUpdated: result.packageJsonUpdated,
        durationMs: elapsedMs,
      });
      this.loggingService.info(
        `[Standalone Build] Generated ${result.writtenFiles} file(s) in ${result.createdDirectories} directory(ies)`
      );
      this.loggingService.info(
        `[Standalone Build] Completed in ${(elapsedMs / 1000).toFixed(2)}s`
      );
      this.loggingService.info(
        `[Standalone Build] Next: Run 'npm install' then 'npm run build' in project root`
      );

      await this.dialogService.showConfirmation({
        title: 'Standalone Build Ready',
        message:
          `✓ Generated ${result.writtenFiles} file(s) across ${result.createdDirectories} director(ies).\n` +
          `Scenes: ${result.sceneCount}, Assets: ${result.assetCount}.\n` +
          `Completed in ${(elapsedMs / 1000).toFixed(2)}s.\n\n` +
          'Next steps:\n1) npm install\n2) npm run build (or npm run build:pix3)',
        confirmLabel: 'OK',
        cancelLabel: 'Close',
      });
    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      this.loggingService.error('[Standalone Build] ✗ Build failed', error);
      this.loggingService.error(`[Standalone Build] Failed after ${(elapsedMs / 1000).toFixed(2)}s`);

      await this.dialogService.showConfirmation({
        title: 'Build Failed',
        message:
          `An error occurred while building the standalone project.\n\n` +
          `Check the Logs tab for details.\n\n` +
          `Error: ${error instanceof Error ? error.message : String(error)}`,
        confirmLabel: 'OK',
        cancelLabel: 'Close',
      });

      throw error;
    }

    return {
      didMutate: false,
      payload: undefined,
    };
  }
}
