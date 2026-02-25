import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';
import type { Navigation2DSettings } from '@/state/AppState';

export interface UpdateEditorSettingsParams {
  warnOnUnsavedUnload?: boolean;
  pauseRenderingOnUnfocus?: boolean;
  navigation2D?: Partial<Navigation2DSettings>;
}

export interface EditorSettingsSnapshot {
  warnOnUnsavedUnload: boolean;
  pauseRenderingOnUnfocus: boolean;
  navigation2D: Navigation2DSettings;
}

export const EDITOR_SETTINGS_STORAGE_KEY = 'pix3.editorSettings:v1';

export const loadEditorSettings = (): Partial<EditorSettingsSnapshot> | null => {
  try {
    const raw = localStorage.getItem(EDITOR_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EditorSettingsSnapshot> | null;
    if (parsed) {
      const result: Partial<EditorSettingsSnapshot> = {};
      if (typeof parsed.warnOnUnsavedUnload === 'boolean') {
        result.warnOnUnsavedUnload = parsed.warnOnUnsavedUnload;
      }
      if (typeof parsed.pauseRenderingOnUnfocus === 'boolean') {
        result.pauseRenderingOnUnfocus = parsed.pauseRenderingOnUnfocus;
      }
      if (parsed.navigation2D && typeof parsed.navigation2D === 'object') {
        const nav2D: Partial<Navigation2DSettings> = {};
        if (typeof parsed.navigation2D.panSensitivity === 'number') {
          nav2D.panSensitivity = parsed.navigation2D.panSensitivity;
        }
        if (typeof parsed.navigation2D.zoomSensitivity === 'number') {
          nav2D.zoomSensitivity = parsed.navigation2D.zoomSensitivity;
        }
        if (Object.keys(nav2D).length > 0) {
          result.navigation2D = nav2D as Navigation2DSettings;
        }
      }
      return result;
    }
    return null;
  } catch {
    return null;
  }
};

export const persistEditorSettings = (settings: EditorSettingsSnapshot): void => {
  try {
    localStorage.setItem(EDITOR_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore persistence errors
  }
};

export class UpdateEditorSettingsOperation implements Operation<OperationInvokeResult> {
  readonly metadata: OperationMetadata = {
    id: 'editor.update-settings',
    title: 'Update Editor Settings',
    description: 'Update editor-level preferences',
    tags: ['editor', 'settings'],
  };

  constructor(private readonly params: UpdateEditorSettingsParams) {}

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { state, snapshot } = context;

    const prevWarn = snapshot.ui.warnOnUnsavedUnload;
    const nextWarn = this.params.warnOnUnsavedUnload ?? prevWarn;

    const prevPause = snapshot.ui.pauseRenderingOnUnfocus;
    const nextPause = this.params.pauseRenderingOnUnfocus ?? prevPause;

    const prevNav2D = snapshot.ui.navigation2D;
    const nextNav2D: Navigation2DSettings = {
      panSensitivity: this.params.navigation2D?.panSensitivity ?? prevNav2D.panSensitivity,
      zoomSensitivity: this.params.navigation2D?.zoomSensitivity ?? prevNav2D.zoomSensitivity,
    };

    const hasChanges =
      nextWarn !== prevWarn ||
      nextPause !== prevPause ||
      nextNav2D.panSensitivity !== prevNav2D.panSensitivity ||
      nextNav2D.zoomSensitivity !== prevNav2D.zoomSensitivity;

    if (!hasChanges) {
      return { didMutate: false };
    }

    state.ui.warnOnUnsavedUnload = nextWarn;
    state.ui.pauseRenderingOnUnfocus = nextPause;
    state.ui.navigation2D = nextNav2D;

    const serialize = (
      w: boolean,
      p: boolean,
      n: Navigation2DSettings
    ): EditorSettingsSnapshot => ({
      warnOnUnsavedUnload: w,
      pauseRenderingOnUnfocus: p,
      navigation2D: n,
    });

    persistEditorSettings(serialize(nextWarn, nextPause, nextNav2D));

    return {
      didMutate: true,
      commit: {
        label: 'Update Editor Settings',
        undo: async () => {
          state.ui.warnOnUnsavedUnload = prevWarn;
          state.ui.pauseRenderingOnUnfocus = prevPause;
          state.ui.navigation2D = prevNav2D;
          persistEditorSettings(serialize(prevWarn, prevPause, prevNav2D));
        },
        redo: async () => {
          state.ui.warnOnUnsavedUnload = nextWarn;
          state.ui.pauseRenderingOnUnfocus = nextPause;
          state.ui.navigation2D = nextNav2D;
          persistEditorSettings(serialize(nextWarn, nextPause, nextNav2D));
        },
      },
    };
  }
}
