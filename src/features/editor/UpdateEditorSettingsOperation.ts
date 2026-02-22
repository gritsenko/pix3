import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';

export interface UpdateEditorSettingsParams {
  warnOnUnsavedUnload?: boolean;
  pauseRenderingOnUnfocus?: boolean;
}

export interface EditorSettingsSnapshot {
  warnOnUnsavedUnload: boolean;
  pauseRenderingOnUnfocus: boolean;
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

  constructor(private readonly params: UpdateEditorSettingsParams) { }

  async perform(context: OperationContext): Promise<OperationInvokeResult> {
    const { state, snapshot } = context;

    const prevWarn = snapshot.ui.warnOnUnsavedUnload;
    const nextWarn = this.params.warnOnUnsavedUnload ?? prevWarn;

    const prevPause = snapshot.ui.pauseRenderingOnUnfocus;
    const nextPause = this.params.pauseRenderingOnUnfocus ?? prevPause;

    if (prevWarn === nextWarn && prevPause === nextPause) {
      return { didMutate: false };
    }

    state.ui.warnOnUnsavedUnload = nextWarn;
    state.ui.pauseRenderingOnUnfocus = nextPause;

    const serialize = (w: boolean, p: boolean): EditorSettingsSnapshot => ({
      warnOnUnsavedUnload: w,
      pauseRenderingOnUnfocus: p,
    });

    persistEditorSettings(serialize(nextWarn, nextPause));

    return {
      didMutate: true,
      commit: {
        label: 'Update Editor Settings',
        undo: async () => {
          state.ui.warnOnUnsavedUnload = prevWarn;
          state.ui.pauseRenderingOnUnfocus = prevPause;
          persistEditorSettings(serialize(prevWarn, prevPause));
        },
        redo: async () => {
          state.ui.warnOnUnsavedUnload = nextWarn;
          state.ui.pauseRenderingOnUnfocus = nextPause;
          persistEditorSettings(serialize(nextWarn, nextPause));
        },
      },
    };
  }
}
