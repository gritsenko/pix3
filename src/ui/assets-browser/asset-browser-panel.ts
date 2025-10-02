import { ComponentBase, customElement, html } from '@/fw';

import '../shared/pix3-panel';
import './asset-tree';
import './asset-browser-panel.ts.css';

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
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-asset-browser-panel': AssetBrowserPanel;
  }
}
