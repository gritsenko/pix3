import { ComponentBase, css, customElement, html, inject, state } from '@/fw';

import '../shared/pix3-panel';
import { ProjectService } from '../../services';

@customElement('pix3-asset-browser-panel')
export class AssetBrowserPanel extends ComponentBase {
  @inject(ProjectService)
  private readonly projectService!: ProjectService;

  @state()
  private entries: import('../../services/FileSystemAPIService').FileDescriptor[] = [];

  protected async firstUpdated(): Promise<void> {
    try {
      const list = await this.projectService.listProjectRoot();
      this.entries = list;
    } catch {
      // ignore
    }
  }
  protected render() {
    return html`
      <pix3-panel
        panel-title="Asset Browser"
        panel-description="Open a project to browse textures, models, and prefabs."
        actions-label="Asset browser actions"
      >
        <div class="asset-list" role="list" aria-label="Project assets">
          ${this.entries.length === 0
            ? html`<p class="panel-placeholder">
                Open a project to browse textures, models, and prefabs.
              </p>`
            : this.entries.map(
                e =>
                  html`<div role="listitem" class="asset-entry">
                    ${e.name} <span class="kind">${e.kind}</span>
                  </div>`
              )}
        </div>
      </pix3-panel>
    `;
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }

    pix3-panel {
      height: 100%;
    }

    .asset-list {
      display: grid;
      gap: 0.75rem;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-asset-browser-panel': AssetBrowserPanel;
  }
}
