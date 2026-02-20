import { injectable, inject } from '@/fw/di';
import { FileSystemAPIService } from './FileSystemAPIService';
import type { CommandContext } from '@/core/command';

interface BuildPackagePatch {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export interface ProjectBuildResult {
  readonly writtenFiles: number;
  readonly createdDirectories: number;
  readonly sceneCount: number;
  readonly assetCount: number;
  readonly packageJsonUpdated: boolean;
}

const RUNTIME_BUILD_COMMAND = 'vite build';
const RUNTIME_DEV_COMMAND = 'vite';

const templateFiles = import.meta.glob('../templates/build/**/*.tpl', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const runtimeSourceFiles = import.meta.glob('../../packages/pix3-runtime/src/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const runtimeConfigFiles = import.meta.glob('../../packages/pix3-runtime/package.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Entry-point files that ship in the user's src/ folder (not part of the library).
const RUNTIME_SRC_ENTRY_FILES = new Set(['main.ts', 'engine-api.ts', 'register-project-scripts.ts']);

@injectable()
export class ProjectBuildService {
  @inject(FileSystemAPIService)
  private readonly fs!: FileSystemAPIService;

  async buildFromTemplates(context: CommandContext): Promise<ProjectBuildResult> {
    const scenePaths = await this.collectScenePaths(context);
    const activeScenePath = this.getActiveScenePath(context);
    const normalizedActiveScenePath =
      activeScenePath && scenePaths.includes(activeScenePath)
        ? activeScenePath
        : (scenePaths[0] ?? '');

    const assetPaths = await this.collectAssetPaths(scenePaths);

    const replacements: Record<string, string> = {
      PROJECT_NAME: context.state.project.projectName ?? 'Pix3 Project',
      ACTIVE_SCENE_PATH: normalizedActiveScenePath,
    };

    let createdDirectories = 0;
    let writtenFiles = 0;
    const ensuredDirectories = new Set<string>();

    for (const [templatePath, templateContents] of Object.entries(templateFiles)) {
      const relativeOutputPath = this.toOutputPath(templatePath);
      if (!relativeOutputPath) {
        continue;
      }
      const rendered = this.renderTemplate(templateContents, replacements);
      await this.ensureParentDirectory(relativeOutputPath, ensuredDirectories);
      if (ensuredDirectories.has(this.getDirectoryPart(relativeOutputPath))) {
        createdDirectories = ensuredDirectories.size;
      }
      await this.fs.writeTextFile(relativeOutputPath, rendered);
      writtenFiles += 1;
    }

    const sceneManifest = this.buildSceneManifestTs(scenePaths, normalizedActiveScenePath);
    const sceneManifestPath = 'src/generated/scene-manifest.ts';
    await this.ensureParentDirectory(sceneManifestPath, ensuredDirectories);
    await this.fs.writeTextFile(sceneManifestPath, sceneManifest);
    writtenFiles += 1;
    writtenFiles += await this.copyRuntimeSources(ensuredDirectories);

    const assetManifest = JSON.stringify({ files: assetPaths }, null, 2) + '\n';
    await this.fs.writeTextFile('asset-manifest.json', assetManifest);
    writtenFiles += 1;

    const packageJsonUpdated = await this.mergePackageJsonPatch();
    createdDirectories = ensuredDirectories.size;

    return {
      writtenFiles,
      createdDirectories,
      sceneCount: scenePaths.length,
      assetCount: assetPaths.length,
      packageJsonUpdated,
    };
  }

  private async collectScenePaths(context: CommandContext): Promise<string[]> {
    const descriptors = Object.values(context.state.scenes.descriptors);
    const fromState = descriptors
      .map(descriptor => this.normalizeResourcePath(descriptor.filePath))
      .filter(path => path.length > 0);

    if (fromState.length > 0) {
      return Array.from(new Set(fromState)).sort((a, b) => a.localeCompare(b));
    }

    const discovered = await this.discoverFilesByExtension('.', '.pix3scene');
    return discovered.sort((a, b) => a.localeCompare(b));
  }

  private getActiveScenePath(context: CommandContext): string {
    const activeId = context.state.scenes.activeSceneId;
    if (!activeId) {
      return '';
    }

    const descriptor = context.state.scenes.descriptors[activeId];
    if (!descriptor) {
      return '';
    }

    return this.normalizeResourcePath(descriptor.filePath);
  }

  private async collectAssetPaths(scenePaths: string[]): Promise<string[]> {
    const files = new Set<string>();

    for (const scenePath of scenePaths) {
      files.add(scenePath);

      try {
        const sceneContents = await this.fs.readTextFile(scenePath);
        const matches = sceneContents.matchAll(/res:\/\/([^\s"'\])]+)/g);
        for (const match of matches) {
          const resourcePath = (match[1] ?? '').trim();
          if (resourcePath.length > 0) {
            files.add(resourcePath);
          }
        }
      } catch {
        // Keep building even if one scene cannot be scanned.
      }
    }

    return Array.from(files).sort((a, b) => a.localeCompare(b));
  }

  private async discoverFilesByExtension(
    directoryPath: string,
    extension: string
  ): Promise<string[]> {
    const result: string[] = [];

    let entries: ReadonlyArray<{ name: string; kind: FileSystemHandleKind; path: string }>;
    try {
      entries = await this.fs.listDirectory(directoryPath);
    } catch {
      return result;
    }

    for (const entry of entries) {
      if (entry.kind === 'file' && entry.path.endsWith(extension)) {
        result.push(entry.path);
      }

      if (entry.kind === 'directory') {
        const nested = await this.discoverFilesByExtension(entry.path, extension);
        result.push(...nested);
      }
    }

    return result;
  }

  private async mergePackageJsonPatch(): Promise<boolean> {
    const patchTemplate = this.getPackagePatchTemplate();
    if (!patchTemplate) {
      return false;
    }

    let existingRaw = '{}';
    try {
      existingRaw = await this.fs.readTextFile('package.json');
    } catch {
      existingRaw = '{}';
    }

    const existing = this.parseJsonRecord(existingRaw);
    const patch = this.parseJsonRecord(patchTemplate) as BuildPackagePatch;

    const scripts = this.ensureStringMap(existing, 'scripts');
    scripts.build = RUNTIME_BUILD_COMMAND;
    scripts.dev = RUNTIME_DEV_COMMAND;

    const patchedScripts = patch.scripts ?? {};
    for (const [name, command] of Object.entries(patchedScripts)) {
      scripts[name] = command;
    }

    this.mergeStringMap(existing, 'dependencies', patch.dependencies ?? {});
    this.mergeStringMap(existing, 'devDependencies', patch.devDependencies ?? {});

    const json = JSON.stringify(existing, null, 2) + '\n';
    await this.fs.writeTextFile('package.json', json);
    return true;
  }

  private async copyRuntimeSources(ensuredDirectories: Set<string>): Promise<number> {
    let writtenFiles = 0;

    for (const [sourcePath, sourceContents] of Object.entries(runtimeSourceFiles)) {
      const outputPath = this.toRuntimeOutputPath(sourcePath);
      if (!outputPath) {
        continue;
      }

      await this.ensureParentDirectory(outputPath, ensuredDirectories);
      await this.fs.writeTextFile(outputPath, sourceContents);
      writtenFiles += 1;
    }

    for (const [sourcePath, sourceContents] of Object.entries(runtimeConfigFiles)) {
      const outputPath = this.toRuntimeOutputPath(sourcePath);
      if (!outputPath) {
        continue;
      }

      await this.ensureParentDirectory(outputPath, ensuredDirectories);
      await this.fs.writeTextFile(outputPath, sourceContents);
      writtenFiles += 1;
    }

    return writtenFiles;
  }

  private mergeStringMap(
    target: Record<string, unknown>,
    key: string,
    patch: Record<string, string>
  ): void {
    const map = this.ensureStringMap(target, key);
    for (const [dep, version] of Object.entries(patch)) {
      if (!(dep in map)) {
        map[dep] = version;
      }
    }
  }

  private ensureStringMap(target: Record<string, unknown>, key: string): Record<string, string> {
    const current = target[key];
    if (this.isStringRecord(current)) {
      return current;
    }

    const created: Record<string, string> = {};
    target[key] = created;
    return created;
  }

  private isStringRecord(value: unknown): value is Record<string, string> {
    if (!value || typeof value !== 'object') {
      return false;
    }

    return Object.values(value).every(item => typeof item === 'string');
  }

  private parseJsonRecord(raw: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Fall through to empty record.
    }
    return {};
  }

  private getPackagePatchTemplate(): string | null {
    for (const [templatePath, templateContents] of Object.entries(templateFiles)) {
      if (templatePath.includes('package.patch.json.tpl')) {
        return templateContents;
      }
    }

    return null;
  }

  private renderTemplate(template: string, replacements: Record<string, string>): string {
    let rendered = template;
    for (const [key, value] of Object.entries(replacements)) {
      rendered = rendered.replaceAll(`{{${key}}}`, value);
    }
    return rendered;
  }

  private normalizeResourcePath(path: string): string {
    return path.startsWith('res://') ? path.substring(6) : path;
  }

  private toOutputPath(templatePath: string): string | null {
    const marker = '../templates/build/';
    const relative = templatePath.includes(marker) ? templatePath.split(marker)[1] : templatePath;
    const withoutTpl = relative.endsWith('.tpl') ? relative.slice(0, -4) : relative;
    if (withoutTpl === 'package.patch.json') {
      return null;
    }

    // Templates are written directly to project root.
    return withoutTpl;
  }

  private toRuntimeOutputPath(sourcePath: string): string | null {
    const sourceMarker = '/packages/pix3-runtime/src/';
    if (sourcePath.includes(sourceMarker)) {
      const relativePath = sourcePath.split(sourceMarker)[1];
      // Skip placeholder generated files — the service writes scene-manifest itself.
      if (relativePath.startsWith('generated/')) {
        return null;
      }
      // App entry-point files live at src/ in the target project.
      if (RUNTIME_SRC_ENTRY_FILES.has(relativePath)) {
        return `src/${relativePath}`;
      }
      // All other library files go into pix3-runtime/src/.
      return `pix3-runtime/src/${relativePath}`;
    }

    return null;
  }

  private buildSceneManifestTs(scenePaths: string[], activeScenePath: string): string {
    const scenePathsJson = JSON.stringify(scenePaths, null, 2);
    const activeJson = JSON.stringify(activeScenePath);

    return [
      'export const scenePaths = ' + scenePathsJson + ' as const;',
      'export const activeScenePath = ' + activeJson + ';',
      '',
    ].join('\n');
  }

  private async ensureParentDirectory(
    filePath: string,
    ensuredDirectories: Set<string>
  ): Promise<void> {
    const directory = this.getDirectoryPart(filePath);
    if (directory === '.' || ensuredDirectories.has(directory)) {
      return;
    }

    try {
      await this.fs.createDirectory(directory);
    } catch {
      // Directory likely already exists.
    }

    ensuredDirectories.add(directory);
  }

  private getDirectoryPart(path: string): string {
    const segments = path.split('/');
    if (segments.length <= 1) {
      return '.';
    }

    return segments.slice(0, -1).join('/');
  }

  dispose(): void {
    // No resources to release.
  }
}