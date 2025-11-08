import { ComponentBase, customElement, html, inject } from '@/fw';
import { AssetFileActivationService, type AssetActivation } from '@/services';
import feather from 'feather-icons';

import '../shared/pix3-panel';
import '../shared/pix3-toolbar';
import '../shared/pix3-toolbar-button';
import '../shared/pix3-dropdown-button';
import './asset-tree';
import './asset-browser-panel.ts.css';

@customElement('pix3-asset-browser-panel')
export class AssetBrowserPanel extends ComponentBase {
  @inject(AssetFileActivationService)
  private readonly assetFileActivation!: AssetFileActivationService;

  private assetTreeRef: HTMLElement | null = null;

  private onAssetActivate = async (e: Event) => {
    const detail = (e as CustomEvent<AssetActivation>).detail;
    if (!detail) return;
    await this.assetFileActivation.handleActivation(detail);
  };

  private onCreateFolder = () => {
    (this.assetTreeRef as any)?.createFolder?.();
  };

  private onCreateScene = () => {
    (this.assetTreeRef as any)?.createScene?.();
  };

  private setAssetTreeRef = (element: HTMLElement) => {
    this.assetTreeRef = element;
  };

  protected render() {
    return html`
      <pix3-panel
        panel-description="Open a project to browse textures, models, and prefabs."
        actions-label="Asset browser actions"
        @asset-activate=${this.onAssetActivate}
      >
        <pix3-toolbar label="Asset browser tools" slot="toolbar">
          <pix3-toolbar-button
            @click=${this.onCreateFolder}
            label="Create folder"
            title="Create folder"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V9L12 2Z"
                fill="currentColor"
                opacity="0.95"
              />
              <path d="M12 2V9H20" fill="rgba(0,0,0,0.06)" />
              <path
                d="M10 13H14M12 11V15"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </pix3-toolbar-button>

          <pix3-dropdown-button
            .icon=${feather.icons['file-plus'].toSvg({ width: 18, height: 18 })}
            .ariaLabel=${'Create asset'}
            .items=${[{ id: 'scene', label: 'Scene' }]}
            @item-select=${(e: CustomEvent) => {
              if (e.detail.id === 'scene') {
                this.onCreateScene();
              }
            }}
          ></pix3-dropdown-button>
        </pix3-toolbar>

        <pix3-asset-tree ${this.setAssetTreeRef}></pix3-asset-tree>
      </pix3-panel>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-asset-browser-panel': AssetBrowserPanel;
  }
}
