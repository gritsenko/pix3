import type {
  Operation,
  OperationContext,
  OperationInvokeResult,
  OperationMetadata,
} from '@/core/Operation';

export interface UpdateEditorSettingsParams {
  warnOnUnsavedUnload?: boolean;
}

export interface EditorSettingsSnapshot {
  warnOnUnsavedUnload: boolean;
}

export const EDITOR_SETTINGS_STORAGE_KEY = 'pix3.editorSettings:v1';

export const loadEditorSettings = (): Partial<EditorSettingsSnapshot> | null => {
  try {
    const raw = localStorage.getItem(EDITOR_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EditorSettingsSnapshot> | null;
    if (parsed && typeof parsed.warnOnUnsavedUnload === 'boolean') {
      return { warnOnUnsavedUnload: parsed.warnOnUnsavedUnload };
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

    if (prevWarn === nextWarn) {
      return { didMutate: false };
    }

    state.ui.warnOnUnsavedUnload = nextWarn;
    persistEditorSettings({ warnOnUnsavedUnload: nextWarn });

    return {
      didMutate: true,
      commit: {
        label: 'Update Editor Settings',
        undo: async () => {
          state.ui.warnOnUnsavedUnload = prevWarn;
          persistEditorSettings({ warnOnUnsavedUnload: prevWarn });
        },
        redo: async () => {
          state.ui.warnOnUnsavedUnload = nextWarn;
          persistEditorSettings({ warnOnUnsavedUnload: nextWarn });
        },
      },
    };
  }
}
