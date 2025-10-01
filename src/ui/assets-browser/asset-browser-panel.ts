import { ComponentBase, css, customElement, html } from '@/fw';

import '../shared/pix3-panel';
import './asset-tree';

@customElement('pix3-asset-browser-panel')
export class AssetBrowserPanel extends ComponentBase {
  protected render() {
    return html`
      <pix3-panel
        panel-title="Asset Browser"
        panel-description="Open a project to browse textures, models, and prefabs."
        actions-label="Asset browser actions"
      >
        <pix3-asset-tree></pix3-asset-tree>
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
