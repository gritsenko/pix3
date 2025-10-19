import { ComponentBase, customElement, html, inject } from '@/fw';
import { AssetLoaderService, type AssetActivation } from '@/services';

import '../shared/pix3-panel';
import './asset-tree';
import './asset-browser-panel.ts.css';

@customElement('pix3-asset-browser-panel')
export class AssetBrowserPanel extends ComponentBase {
  @inject(AssetLoaderService)
  private readonly assetLoader!: AssetLoaderService;

  private onAssetActivate = async (e: Event) => {
    const detail = (e as CustomEvent<AssetActivation>).detail;
    if (!detail) return;
    await this.assetLoader.handleActivation(detail);
  };

  protected render() {
    return html`
      <pix3-panel
        panel-description="Open a project to browse textures, models, and prefabs."
        actions-label="Asset browser actions"
        @asset-activate=${this.onAssetActivate}
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
