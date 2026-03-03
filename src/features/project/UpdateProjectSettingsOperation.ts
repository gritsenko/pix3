import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import { createDefaultProjectManifest, type ProjectManifest } from '@/core/ProjectManifest';
import { ProjectService } from '@/services/ProjectService';

export interface UpdateProjectSettingsParams {
  projectName?: string;
  localAbsolutePath?: string | null;
  viewportBaseWidth?: number;
  viewportBaseHeight?: number;
}

interface ProjectManifestSnapshotLike {
  version: string;
  viewportBaseSize: {
    width: number;
    height: number;
  };
  autoloads: ReadonlyArray<{
    scriptPath: string;
    singleton: string;
    enabled: boolean;
  }>;
  metadata?: Record<string, unknown>;
}

const cloneManifest = (manifest: ProjectManifestSnapshotLike): ProjectManifest => ({
  version: manifest.version,
  viewportBaseSize: {
    width: manifest.viewportBaseSize.width,
    height: manifest.viewportBaseSize.height,
  },
  autoloads: manifest.autoloads.map(entry => ({ ...entry })),
  metadata: manifest.metadata ? { ...manifest.metadata } : {},
});

/**
 * Persists the given recent project entry to localStorage.
 */
function persistRecentProject(entry: {
  id?: string;
  name: string;
  localAbsolutePath?: string;
  lastOpenedAt: number;
}): void {
  try {
    const RECENTS_KEY = 'pix3.recentProjects:v1';
    const raw = localStorage.getItem(RECENTS_KEY);
    const existing = raw ? (JSON.parse(raw) as (typeof entry)[]) : [];
    const filtered = existing.filter(r => (entry.id ? r.id !== entry.id : r.name !== entry.name));
    const updated = [entry, ...filtered].slice(0, 10);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
  } catch {
    // ignore persistence errors
  }
}

export class UpdateProjectSettingsOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'project.update-settings',
    title: 'Update Project Settings',
    description: 'Update project metadata like name and local absolute path',
    tags: ['project', 'settings'],
  };

  constructor(private readonly params: UpdateProjectSettingsParams) {}

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { state, snapshot, container } = context;

    const projectService = container.getService<ProjectService>(
      container.getOrCreateToken(ProjectService)
    );

    const prevName = snapshot.project.projectName;
    const prevPath = snapshot.project.localAbsolutePath;
    const prevManifest = cloneManifest(snapshot.project.manifest ?? createDefaultProjectManifest());

    const newName = this.params.projectName !== undefined ? this.params.projectName : prevName;
    const newPath =
      this.params.localAbsolutePath !== undefined ? this.params.localAbsolutePath : prevPath;
    const nextViewportBaseWidth =
      this.params.viewportBaseWidth !== undefined
        ? this.params.viewportBaseWidth
        : prevManifest.viewportBaseSize.width;
    const nextViewportBaseHeight =
      this.params.viewportBaseHeight !== undefined
        ? this.params.viewportBaseHeight
        : prevManifest.viewportBaseSize.height;
    const nextManifest: ProjectManifest = {
      ...prevManifest,
      viewportBaseSize: {
        width: nextViewportBaseWidth,
        height: nextViewportBaseHeight,
      },
    };

    if (
      prevName === newName &&
      prevPath === newPath &&
      prevManifest.viewportBaseSize.width === nextManifest.viewportBaseSize.width &&
      prevManifest.viewportBaseSize.height === nextManifest.viewportBaseSize.height
    ) {
      return { didMutate: false };
    }

    try {
      await projectService.saveProjectManifest(nextManifest);
      state.project.projectName = newName;
      state.project.localAbsolutePath = newPath;
      state.project.manifest = nextManifest;
    } catch {
      return { didMutate: false };
    }

    // Persist changes to recent projects
    if (state.project.status === 'ready' && state.project.id) {
      persistRecentProject({
        id: state.project.id,
        name: newName ?? 'Untitled Project',
        localAbsolutePath: newPath ?? undefined,
        lastOpenedAt: Date.now(),
      });
    }

    return {
      didMutate: true,
      commit: {
        label: 'Update Project Settings',
        undo: async () => {
          await projectService.saveProjectManifest(prevManifest);
          state.project.projectName = prevName;
          state.project.localAbsolutePath = prevPath;
          state.project.manifest = prevManifest;
          if (state.project.status === 'ready' && state.project.id) {
            persistRecentProject({
              id: state.project.id,
              name: prevName ?? 'Untitled Project',
              localAbsolutePath: prevPath ?? undefined,
              lastOpenedAt: Date.now(),
            });
          }
        },
        redo: async () => {
          await projectService.saveProjectManifest(nextManifest);
          state.project.projectName = newName;
          state.project.localAbsolutePath = newPath;
          state.project.manifest = nextManifest;
          if (state.project.status === 'ready' && state.project.id) {
            persistRecentProject({
              id: state.project.id,
              name: newName ?? 'Untitled Project',
              localAbsolutePath: newPath ?? undefined,
              lastOpenedAt: Date.now(),
            });
          }
        },
      },
    };
  }
}
