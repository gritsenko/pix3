import { ComponentBase, customElement, html, inject, state } from '@/fw';
import { appState } from '@/state';
import { ProjectSettingsService } from '@/services/ProjectSettingsService';
import { OperationService } from '@/services/OperationService';
import { UpdateProjectSettingsOperation } from '@/features/project/UpdateProjectSettingsOperation';
import './pix3-project-settings-dialog.ts.css';

@customElement('pix3-project-settings-dialog')
export class ProjectSettingsDialog extends ComponentBase {
  @inject(ProjectSettingsService)
  private readonly projectSettingsService!: ProjectSettingsService;

  @inject(OperationService)
  private readonly operationService!: OperationService;

  @state()
  private projectName: string = '';

  @state()
  private localAbsolutePath: string = '';

  connectedCallback(): void {
    super.connectedCallback();
    this.projectName = appState.project.projectName ?? '';
    this.localAbsolutePath = appState.project.localAbsolutePath ?? '';
  }

  protected render() {
    return html`
      <div class="dialog-backdrop" @click=${this.onCancel}>
        <div class="dialog-content" @click=${(e: Event) => e.stopPropagation()}>
          <h2 class="dialog-title">Project Settings</h2>
          
          <div class="settings-form">
            <div class="settings-field">
              <label for="projectName">Project Name</label>
              <input 
                id="projectName" 
                type="text" 
                .value=${this.projectName} 
                @input=${(e: InputEvent) => this.projectName = (e.target as HTMLInputElement).value}
                placeholder="My Awesome Project"
              />
            </div>

            <div class="settings-field">
              <label for="localAbsolutePath">Local Project Path (Absolute)</label>
              <input 
                id="localAbsolutePath" 
                type="text" 
                .value=${this.localAbsolutePath} 
                @input=${(e: InputEvent) => this.localAbsolutePath = (e.target as HTMLInputElement).value}
                placeholder="/Users/name/projects/my-game"
              />
              <div class="hint">
                Configure the absolute path to your project root to enable VS Code integration.
                Example: <code>/Users/name/Projects/my-pix3-game</code>
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

  private onCancel(): void {
    this.projectSettingsService.close();
  }

  private async onSave(): Promise<void> {
    const operation = new UpdateProjectSettingsOperation({
      projectName: this.projectName.trim() || undefined,
      localAbsolutePath: this.localAbsolutePath.trim() || null
    });

    await this.operationService.invokeAndPush(operation);
    this.projectSettingsService.close();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-project-settings-dialog': ProjectSettingsDialog;
  }
}
