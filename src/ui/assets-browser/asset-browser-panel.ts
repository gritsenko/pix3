import { ComponentBase, customElement, html, inject, state } from '@/fw';
import { ref } from 'lit/directives/ref.js';
import { AssetFileActivationService, type AssetActivation } from '@/services';

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

  @state()
  private showDeleteConfirm = false;

  @state()
  private selectedItemName: string | null = null;

  private onAssetActivate = async (e: Event) => {
    const detail = (e as CustomEvent<AssetActivation>).detail;
    if (!detail) return;
    await this.assetFileActivation.handleActivation(detail);
  };

  private onCreateFolder = async () => {
    try {
      console.log('[AssetBrowserPanel] Creating folder...', { assetTreeRef: this.assetTreeRef });
      if (!this.assetTreeRef) {
        console.warn('[AssetBrowserPanel] assetTreeRef is null, cannot create folder');
        return;
      }
      const assetTree = this.assetTreeRef as any;
      if (!assetTree.createFolder || typeof assetTree.createFolder !== 'function') {
        console.warn('[AssetBrowserPanel] createFolder method not found on asset tree');
        return;
      }
      await assetTree.createFolder();
      console.log('[AssetBrowserPanel] Folder creation initiated');
    } catch (error) {
      console.error('[AssetBrowserPanel] Failed to create folder:', error);
    }
  };

  private onCreateScene = () => {
    try {
      console.log('[AssetBrowserPanel] Creating scene...', { assetTreeRef: this.assetTreeRef });
      if (!this.assetTreeRef) {
        console.warn('[AssetBrowserPanel] assetTreeRef is null, cannot create scene');
        return;
      }
      const assetTree = this.assetTreeRef as any;
      if (!assetTree.createScene || typeof assetTree.createScene !== 'function') {
        console.warn('[AssetBrowserPanel] createScene method not found on asset tree');
        return;
      }
      assetTree.createScene();
      console.log('[AssetBrowserPanel] Scene creation initiated');
    } catch (error) {
      console.error('[AssetBrowserPanel] Failed to create scene:', error);
    }
  };

  private onDeleteClick = () => {
    try {
      const assetTree = this.assetTreeRef as any;
      const selectedPath = assetTree?.selectedPath;
      
      if (!selectedPath) {
        console.warn('[AssetBrowserPanel] No item selected for deletion');
        return;
      }

      // Extract name from path for display
      const itemName = selectedPath.split('/').pop() || selectedPath;
      this.selectedItemName = itemName;
      this.showDeleteConfirm = true;
      console.log('[AssetBrowserPanel] Delete confirmation opened for:', itemName);
    } catch (error) {
      console.error('[AssetBrowserPanel] Failed to open delete confirmation:', error);
    }
  };

  private async onConfirmDelete() {
    try {
      console.log('[AssetBrowserPanel] Confirming delete of:', this.selectedItemName);
      this.showDeleteConfirm = false;
      
      if (!this.assetTreeRef) {
        console.warn('[AssetBrowserPanel] assetTreeRef is null');
        return;
      }
      
      const assetTree = this.assetTreeRef as any;
      if (!assetTree.deleteSelected || typeof assetTree.deleteSelected !== 'function') {
        console.warn('[AssetBrowserPanel] deleteSelected method not found on asset tree');
        return;
      }
      
      await assetTree.deleteSelected();
      console.log('[AssetBrowserPanel] Item deleted successfully');
    } catch (error) {
      console.error('[AssetBrowserPanel] Failed to delete item:', error);
    }
  }

  private onCancelDelete() {
    console.log('[AssetBrowserPanel] Delete cancelled');
    this.showDeleteConfirm = false;
    this.selectedItemName = null;
  }

  private setAssetTreeRef = (element: Element | undefined) => {
    this.assetTreeRef = element as HTMLElement | null;
  };

  protected render() {
    return html`
      <pix3-panel
      panel-description="Open a project to browse textures, models, and prefabs."
      actions-label="Asset browser actions"
      @asset-activate=${this.onAssetActivate}
      >
      <pix3-toolbar label="Asset browser tools" slot="toolbar">
        <pix3-dropdown-button
          icon="plus-circle"
          aria-label="Create"
          .items=${[
            { id: 'folder', label: 'Create folder', icon: 'folder' },
            { id: 'scene', label: 'Create scene', icon: 'film' },
          ]}
          @item-select=${(e: CustomEvent) => {
            if (e.detail.id === 'folder') {
              this.onCreateFolder();
            } else if (e.detail.id === 'scene') {
              this.onCreateScene();
            }
          }}
        ></pix3-dropdown-button>
        <pix3-toolbar-button
        icon="trash"
        label="Delete"
        title="Delete selected item"
        @click=${this.onDeleteClick}
        ></pix3-toolbar-button>
      </pix3-toolbar>

      <pix3-asset-tree ${ref(this.setAssetTreeRef)}></pix3-asset-tree>

      ${this.showDeleteConfirm
        ? html`<div class="delete-modal-backdrop" @click=${this.onCancelDelete.bind(this)}>
          <div class="delete-modal" @click=${(e: Event) => e.stopPropagation()}>
          <h2>Delete Item?</h2>
          <p>Are you sure you want to delete <strong>${this.selectedItemName}</strong>?</p>
          <p style="color: var(--color-warning, #ff9800); font-size: 0.9em;">
            This action cannot be undone.
          </p>
          <div class="modal-actions">
            <button class="btn-cancel" @click=${this.onCancelDelete.bind(this)}>
            Cancel
            </button>
            <button class="btn-delete" @click=${this.onConfirmDelete.bind(this)}>
            Delete
            </button>
          </div>
          </div>
        </div>`
        : null}
      </pix3-panel>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-asset-browser-panel': AssetBrowserPanel;
  }
}
