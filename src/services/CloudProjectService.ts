import { injectable, inject } from '@/fw/di';
import { appState } from '@/state';
import * as ApiClient from './ApiClient';
import type { ApiProject } from './ApiClient';
import { ProjectService } from './ProjectService';
import { ProjectStorageService } from './ProjectStorageService';
import { EditorTabService } from './EditorTabService';
import type { ProjectManifest } from '@/core/ProjectManifest';
import { stringify } from 'yaml';
import { sceneTemplates } from './template-data';

export interface CloudProjectState {
  projects: ApiProject[];
  isLoading: boolean;
}

export interface CreateCloudProjectOptions {
  readonly name: string;
  readonly manifest: ProjectManifest;
}

export interface OpenCloudProjectOptions {
  readonly beforeActivate?: () => Promise<void>;
}

@injectable()
export class CloudProjectService {
  @inject(ProjectService)
  private readonly projectService!: ProjectService;

  @inject(ProjectStorageService)
  private readonly storage!: ProjectStorageService;

  @inject(EditorTabService)
  private readonly editorTabService!: EditorTabService;

  private state: CloudProjectState = {
    projects: [],
    isLoading: false,
  };

  async loadProjects(): Promise<void> {
    if (!appState.auth.isAuthenticated) {
      this.state = {
        projects: [],
        isLoading: false,
      };
      this.notifyListeners();
      return;
    }

    this.state = {
      ...this.state,
      isLoading: true,
    };
    this.notifyListeners();

    try {
      const projects = await ApiClient.getProjects();
      this.state = {
        projects,
        isLoading: false,
      };
      this.notifyListeners();
    } catch {
      this.state = {
        projects: [],
        isLoading: false,
      };
      this.notifyListeners();
    }
  }

  private listeners = new Set<(state: CloudProjectState) => void>();

  subscribe(fn: (state: CloudProjectState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private notifyListeners() {
    this.listeners.forEach(fn => fn(this.state));
  }

  async createProject(name: string): Promise<ApiProject> {
    const project = await ApiClient.createProject(name);
    await this.loadProjects();
    return project;
  }

  async createProjectFromTemplate(
    options: CreateCloudProjectOptions,
    openOptions?: OpenCloudProjectOptions
  ): Promise<ApiProject> {
    const project = await ApiClient.createProject(options.name);
    const manifestYaml = stringify(
      {
        version: options.manifest.version,
        viewportBaseSize: options.manifest.viewportBaseSize,
        metadata: options.manifest.metadata ?? {},
        autoloads: options.manifest.autoloads.map(entry => ({
          scriptPath: entry.scriptPath,
          singleton: entry.singleton,
          enabled: entry.enabled,
        })),
      },
      { indent: 2 }
    );

    await ApiClient.uploadFile(project.id, 'pix3project.yaml', manifestYaml);
    await ApiClient.uploadFile(
      project.id,
      ProjectService.STARTUP_SCENE_PATH,
      sceneTemplates.find(template => template.id === 'startup-scene')?.contents ??
        sceneTemplates[0]?.contents ??
        ''
    );

    await this.loadProjects();
    await this.openProject(project.id, openOptions);
    return project;
  }

  async deleteProject(id: string): Promise<void> {
    await ApiClient.deleteProject(id);
    await this.loadProjects();
  }

  async generateShareToken(id: string): Promise<string> {
    const result = await ApiClient.generateShareToken(id);
    await this.loadProjects();
    return result.share_token;
  }

  async revokeShareToken(id: string): Promise<void> {
    await ApiClient.revokeShareToken(id);
    await this.loadProjects();
  }

  async openProject(projectId: string, options?: OpenCloudProjectOptions): Promise<void> {
    const project = this.state.projects.find(entry => entry.id === projectId) ?? null;

    await options?.beforeActivate?.();
    this.resetOpenProjectState();

    appState.project.id = projectId;
    appState.project.backend = 'cloud';
    appState.project.directoryHandle = null;
    appState.project.projectName = project?.name ?? 'Cloud Project';
    appState.project.localAbsolutePath = null;
    appState.project.status = 'ready';
    appState.project.errorMessage = null;

    appState.project.manifest = await this.projectService.loadProjectManifest();
    await this.storage.refreshManifest();

    this.projectService.addRecentProject({
      id: projectId,
      name: appState.project.projectName ?? 'Cloud Project',
      backend: 'cloud',
      lastOpenedAt: Date.now(),
    });

    const manifest = await this.storage.getManifestEntries();
    const scenePaths = manifest
      .map(entry => entry.path)
      .filter(path => path.endsWith('.pix3scene'))
      .sort((a, b) => a.localeCompare(b));

    const preferredScenePath = this.getPreferredScenePath(projectId);
    const initialScenePath =
      (preferredScenePath && scenePaths.includes(preferredScenePath) ? preferredScenePath : null) ??
      scenePaths[0] ??
      null;

    if (!initialScenePath) {
      return;
    }

    appState.project.lastOpenedScenePath = `res://${initialScenePath}`;
    appState.scenes.pendingScenePaths = [`res://${initialScenePath}`];
    await this.editorTabService.focusOrOpenScene(`res://${initialScenePath}`);
  }

  private normalizeScenePath(scenePath: string | null): string | null {
    if (!scenePath) {
      return null;
    }

    return scenePath.replace(/^res:\/\//i, '').replace(/^\/+/, '');
  }

  private getPreferredScenePath(projectId: string): string | null {
    try {
      const raw = localStorage.getItem(`pix3.projectTabs:${projectId}`);
      if (!raw) {
        return null;
      }

      const session = JSON.parse(raw) as {
        activeTabId?: string | null;
        tabs?: Array<{ type?: string; resourceId?: string }>;
      };
      if (!Array.isArray(session.tabs)) {
        return null;
      }

      const preferredTab = session.tabs.find(tab => tab.type === 'scene');

      return this.normalizeScenePath(preferredTab?.resourceId ?? null);
    } catch {
      return null;
    }
  }

  private resetOpenProjectState(): void {
    appState.scenes.activeSceneId = null;
    appState.scenes.descriptors = {};
    appState.scenes.hierarchies = {};
    appState.scenes.loadState = 'idle';
    appState.scenes.loadError = null;
    appState.scenes.lastLoadedAt = null;
    appState.scenes.pendingScenePaths = [];
    appState.scenes.nodeDataChangeSignal = 0;
    appState.scenes.cameraStates = {};
    appState.scenes.previewCameraNodeIds = {};
    appState.tabs.tabs = [];
    appState.tabs.activeTabId = null;
    appState.selection.nodeIds = [];
    appState.selection.primaryNodeId = null;
    appState.selection.hoveredNodeId = null;
    appState.project.assetBrowserExpandedPaths = [];
    appState.project.assetBrowserSelectedPath = null;
    appState.project.scriptsStatus = 'idle';
    appState.project.fileRefreshSignal = 0;
    appState.project.scriptRefreshSignal = 0;
    appState.project.lastModifiedDirectoryPath = null;
  }
}
