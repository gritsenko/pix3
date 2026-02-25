import { ComponentBase, customElement, html, inject, state } from '@/fw';
import { appState } from '@/state';
import { EditorSettingsService } from '@/services/EditorSettingsService';
import { OperationService } from '@/services/OperationService';
import { UpdateEditorSettingsOperation } from '@/features/editor/UpdateEditorSettingsOperation';
import type { Navigation2DSettings } from '@/state/AppState';
import './pix3-editor-settings-dialog.ts.css';

@customElement('pix3-editor-settings-dialog')
export class EditorSettingsDialog extends ComponentBase {
  @inject(EditorSettingsService)
  private readonly editorSettingsService!: EditorSettingsService;

  @inject(OperationService)
  private readonly operationService!: OperationService;

  @state()
  private warnOnUnsavedUnload = true;

  @state()
  private pauseRenderingOnUnfocus = true;

  @state()
  private navigation2D: Navigation2DSettings = {
    panSensitivity: 0.75,
    zoomSensitivity: 0.001,
  };

  connectedCallback(): void {
    super.connectedCallback();
    this.warnOnUnsavedUnload = appState.ui.warnOnUnsavedUnload;
    this.pauseRenderingOnUnfocus = appState.ui.pauseRenderingOnUnfocus;
    this.navigation2D = { ...appState.ui.navigation2D };
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

            <div class="settings-field">
              <label class="toggle-row">
                <input
                  type="checkbox"
                  .checked=${this.pauseRenderingOnUnfocus}
                  @change=${this.onPauseToggle}
                />
                <span>Pause rendering when window is unfocused</span>
              </label>
              <div class="hint">
                Reduces CPU/GPU usage and saves battery when you are working in another window.
              </div>
            </div>

            <div class="settings-section">
              <h3 class="section-title">2D Navigation</h3>

              <div class="settings-field">
                <label class="slider-row">
                  <span>Pan Sensitivity: ${this.navigation2D.panSensitivity.toFixed(2)}</span>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    .value=${String(this.navigation2D.panSensitivity)}
                    @input=${this.onPanSensitivityChange}
                  />
                </label>
                <div class="hint">
                  Controls how fast the camera pans with mouse wheel or trackpad gestures.
                </div>
              </div>

              <div class="settings-field">
                <label class="slider-row">
                  <span>Zoom Sensitivity: ${this.navigation2D.zoomSensitivity.toFixed(4)}</span>
                  <input
                    type="range"
                    min="0.001"
                    max="0.01"
                    step="0.0005"
                    .value=${String(this.navigation2D.zoomSensitivity)}
                    @input=${this.onZoomSensitivityChange}
                  />
                </label>
                <div class="hint">
                  Controls how fast the camera zooms with Ctrl+wheel or pinch gestures.
                </div>
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

  private onPauseToggle(e: Event): void {
    const target = e.target as HTMLInputElement;
    this.pauseRenderingOnUnfocus = target.checked;
  }

  private onPanSensitivityChange(e: Event): void {
    const target = e.target as HTMLInputElement;
    this.navigation2D.panSensitivity = parseFloat(target.value);
  }

  private onZoomSensitivityChange(e: Event): void {
    const target = e.target as HTMLInputElement;
    this.navigation2D.zoomSensitivity = parseFloat(target.value);
  }

  private onCancel(): void {
    this.editorSettingsService.close();
  }

  private async onSave(): Promise<void> {
    const operation = new UpdateEditorSettingsOperation({
      warnOnUnsavedUnload: this.warnOnUnsavedUnload,
      pauseRenderingOnUnfocus: this.pauseRenderingOnUnfocus,
      navigation2D: this.navigation2D,
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
