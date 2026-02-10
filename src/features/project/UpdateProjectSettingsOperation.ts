import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';

export interface UpdateProjectSettingsParams {
  projectName?: string;
  localAbsolutePath?: string | null;
}

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
    const existing = raw ? (JSON.parse(raw) as typeof entry[]) : [];
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
    const { state, snapshot } = context;

    const prevName = snapshot.project.projectName;
    const prevPath = snapshot.project.localAbsolutePath;

    const newName = this.params.projectName !== undefined ? this.params.projectName : prevName;
    const newPath = this.params.localAbsolutePath !== undefined ? this.params.localAbsolutePath : prevPath;

    if (prevName === newName && prevPath === newPath) {
      return { didMutate: false };
    }

    state.project.projectName = newName;
    state.project.localAbsolutePath = newPath;

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
          state.project.projectName = prevName;
          state.project.localAbsolutePath = prevPath;
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
          state.project.projectName = newName;
          state.project.localAbsolutePath = newPath;
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
