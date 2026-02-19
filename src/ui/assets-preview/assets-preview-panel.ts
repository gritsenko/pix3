import { ComponentBase, customElement, html, inject, state } from '@/fw';
import {
  AssetFileActivationService,
  AssetsPreviewService,
  IconService,
  type AssetActivation,
  type AssetPreviewItem,
  type AssetsPreviewSnapshot,
} from '@/services';
import './assets-preview-panel.ts.css';
import '../shared/pix3-panel';

@customElement('pix3-assets-preview-panel')
export class AssetsPreviewPanel extends ComponentBase {
  @inject(AssetsPreviewService)
  private readonly assetsPreviewService!: AssetsPreviewService;

  @inject(AssetFileActivationService)
  private readonly assetFileActivationService!: AssetFileActivationService;

  @inject(IconService)
  private readonly iconService!: IconService;

  @state()
  private snapshot: AssetsPreviewSnapshot = {
    selectedFolderPath: null,
    displayPath: 'res://',
    isLoading: false,
    errorMessage: null,
    items: [],
  };

  private disposePreviewSubscription?: () => void;

  connectedCallback(): void {
    super.connectedCallback();
    this.disposePreviewSubscription = this.assetsPreviewService.subscribe(snapshot => {
      this.snapshot = snapshot;
      this.requestUpdate();
    });
  }

  disconnectedCallback(): void {
    this.disposePreviewSubscription?.();
    this.disposePreviewSubscription = undefined;
    super.disconnectedCallback();
  }

  protected render() {
    return html`
      <pix3-panel panel-description="Select a folder in Asset Browser to preview files as thumbnails.">
        <span slot="subtitle" class="folder-path">${this.snapshot.displayPath}</span>
        <div class="preview-root">
          ${this.snapshot.isLoading
            ? html`<p class="preview-status">Loading folder preview...</p>`
            : this.snapshot.errorMessage
              ? html`<p class="preview-status preview-error">${this.snapshot.errorMessage}</p>`
              : this.snapshot.items.length === 0
                ? html`<p class="preview-status">No files found in this folder.</p>`
                : html`<div class="preview-grid">
                    ${this.snapshot.items.map(item => this.renderItem(item))}
                  </div>`}
        </div>
      </pix3-panel>
    `;
  }

  private renderItem(item: AssetPreviewItem) {
    return html`
      <button
        class="preview-item"
        title=${item.name}
        @dblclick=${() => {
          void this.onItemActivate(item);
        }}
      >
        <span class="thumb">
          ${item.previewType === 'image' && item.thumbnailUrl
            ? html`<img src=${item.thumbnailUrl} alt=${item.name} loading="lazy" />`
            : html`<span class="icon">${this.iconService.getIcon(item.iconName, 24)}</span>`}
        </span>
        <span class="name">${item.name}</span>
      </button>
    `;
  }

  private async onItemActivate(item: AssetPreviewItem): Promise<void> {
    if (item.kind !== 'file') {
      return;
    }

    const activation: AssetActivation = {
      name: item.name,
      path: item.path,
      kind: item.kind,
      resourcePath: this.toResourcePath(item.path),
      extension: item.extension,
    };

    await this.assetFileActivationService.handleActivation(activation);
  }

  private toResourcePath(path: string): string {
    const normalizedPath = path.replace(/\\+/g, '/').replace(/^(\.?\/)+/, '').replace(/^\/+/, '');
    return `res://${normalizedPath}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-assets-preview-panel': AssetsPreviewPanel;
  }
}
