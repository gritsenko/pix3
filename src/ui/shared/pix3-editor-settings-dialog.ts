import { ComponentBase, customElement, html, inject, state } from '@/fw';
import { appState } from '@/state';
import { EditorSettingsService } from '@/services/EditorSettingsService';
import { OperationService } from '@/services/OperationService';
import { UpdateEditorSettingsOperation } from '@/features/editor/UpdateEditorSettingsOperation';
import './pix3-editor-settings-dialog.ts.css';

@customElement('pix3-editor-settings-dialog')
export class EditorSettingsDialog extends ComponentBase {
  @inject(EditorSettingsService)
  private readonly editorSettingsService!: EditorSettingsService;

  @inject(OperationService)
  private readonly operationService!: OperationService;

  @state()
  private warnOnUnsavedUnload = true;

  connectedCallback(): void {
    super.connectedCallback();
    this.warnOnUnsavedUnload = appState.ui.warnOnUnsavedUnload;
  }

  protected render() {
    return html`
      <div class="dialog-backdrop" @click=${this.onCancel}>
        <div class="dialog-content" @click=${(e: Event) => e.stopPropagation()}>
          <h2 class="dialog-title">Editor Settings</h2>

          <div class="settings-form">
            <div class="settings-field">
              <label class="toggle-row">
                <input
                  type="checkbox"
                  .checked=${this.warnOnUnsavedUnload}
                  @change=${this.onWarnToggle}
                />
                <span>Warn me about unsaved changes when leaving the page</span>
              </label>
              <div class="hint">
                Disable this to skip the browser confirmation dialog on refresh or navigation.
              </div>
            </div>
          </div>

          <div class="dialog-actions">
            <button class="btn-cancel" @click=${this.onCancel}>Cancel</button>
            <button class="btn-save" @click=${this.onSave}>Save Changes</button>
          </div>
        </div>
      </div>
    `;
  }

  private onWarnToggle(e: Event): void {
    const target = e.target as HTMLInputElement;
    this.warnOnUnsavedUnload = target.checked;
  }

  private onCancel(): void {
    this.editorSettingsService.close();
  }

  private async onSave(): Promise<void> {
    const operation = new UpdateEditorSettingsOperation({
      warnOnUnsavedUnload: this.warnOnUnsavedUnload,
    });

    await this.operationService.invoke(operation);
    this.editorSettingsService.close();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-editor-settings-dialog': EditorSettingsDialog;
  }
}
