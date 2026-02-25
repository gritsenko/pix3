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
    selectedItemPath: null,
    selectedItem: null,
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
    const isSelected = this.snapshot.selectedItemPath === item.path;
    return html`
      <button
        class="preview-item ${isSelected ? 'is-selected' : ''}"
        title=${this.buildTooltip(item)}
        ?draggable=${item.kind === 'file'}
        @click=${() => this.onItemSelected(item)}
        @dblclick=${() => {
          void this.onItemDoubleClick(item);
        }}
        @dragstart=${(event: DragEvent) => this.onItemDragStart(event, item)}
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

  private onItemSelected(item: AssetPreviewItem): void {
    this.assetsPreviewService.selectItem(item.path);
  }

  private onItemDragStart(event: DragEvent, item: AssetPreviewItem): void {
    if (item.kind !== 'file' || !event.dataTransfer) {
      return;
    }

    const resourcePath = this.toResourcePath(item.path);
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('text/plain', item.path);
    event.dataTransfer.setData('application/x-pix3-asset-path', item.path);
    event.dataTransfer.setData('application/x-pix3-asset-resource', resourcePath);
    event.dataTransfer.setData('text/uri-list', resourcePath);
  }

  private async onItemDoubleClick(item: AssetPreviewItem): Promise<void> {
    if (item.kind === 'directory') {
      window.dispatchEvent(
        new CustomEvent('assets-preview:reveal-path', {
          detail: { path: item.path },
        })
      );
      return;
    }

    await this.onItemActivate(item);
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

  private buildTooltip(item: AssetPreviewItem): string {
    const lines: string[] = [item.name];

    if (item.width !== null && item.height !== null) {
      lines.push(`Resolution: ${item.width} x ${item.height}`);
    }

    if (item.sizeBytes !== null) {
      lines.push(`Size: ${this.formatFileSize(item.sizeBytes)}`);
    }

    return lines.join('\n');
  }

  private formatFileSize(sizeBytes: number): string {
    if (sizeBytes < 1024) {
      return `${sizeBytes} B`;
    }
    const kb = sizeBytes / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)} KB`;
    }
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-assets-preview-panel': AssetsPreviewPanel;
  }
}
