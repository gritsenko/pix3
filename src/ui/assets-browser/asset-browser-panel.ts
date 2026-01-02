import { ComponentBase, customElement, html, inject, state } from '@/fw';
import { ref } from 'lit/directives/ref.js';
import { AssetFileActivationService, type AssetActivation } from '@/services';
import { DialogService } from '@/services/DialogService';

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

  @inject(DialogService)
  private readonly dialogService!: DialogService;

  private assetTreeRef: HTMLElement | null = null;

  @state()
  private selectedItemName: string | null = null;

  private scriptFileCreatedHandler?: (e: Event) => void;

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

      // Show confirmation dialog
      void this.showDeleteConfirmation(itemName);
    } catch (error) {
      console.error('[AssetBrowserPanel] Failed to open delete confirmation:', error);
    }
  };

  private onRenameClick = () => {
    try {
      console.log('[AssetBrowserPanel] Renaming item...', { assetTreeRef: this.assetTreeRef });
      if (!this.assetTreeRef) {
        console.warn('[AssetBrowserPanel] assetTreeRef is null, cannot rename');
        return;
      }
      const assetTree = this.assetTreeRef as any;
      if (!assetTree.renameSelected || typeof assetTree.renameSelected !== 'function') {
        console.warn('[AssetBrowserPanel] renameSelected method not found on asset tree');
        return;
      }
      void assetTree.renameSelected();
      console.log('[AssetBrowserPanel] Rename initiated');
    } catch (error) {
      console.error('[AssetBrowserPanel] Failed to rename item:', error);
    }
  };

  private async showDeleteConfirmation(itemName: string): Promise<void> {
    try {
      const confirmed = await this.dialogService.showConfirmation({
        title: 'Delete Item?',
        message: `Are you sure you want to delete ${itemName}?`,
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
        isDangerous: true,
      });

      if (confirmed) {
        await this.performDelete();
      }
    } catch (error) {
      console.error('[AssetBrowserPanel] Error showing delete confirmation:', error);
    }
  }

  private async performDelete(): Promise<void> {
    try {
      console.log('[AssetBrowserPanel] Performing delete of:', this.selectedItemName);

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
      this.selectedItemName = null;
    } catch (error) {
      console.error('[AssetBrowserPanel] Failed to delete item:', error);
    }
  }

  private setAssetTreeRef = (element: Element | undefined) => {
    this.assetTreeRef = element as HTMLElement | null;
  };

  connectedCallback(): void {
    super.connectedCallback();

    this.scriptFileCreatedHandler = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { filePath } = customEvent.detail;
      void this.onScriptFileCreated(filePath);
    };

    window.addEventListener('script-file-created', this.scriptFileCreatedHandler as EventListener);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();

    if (this.scriptFileCreatedHandler) {
      window.removeEventListener(
        'script-file-created',
        this.scriptFileCreatedHandler as EventListener
      );
      this.scriptFileCreatedHandler = undefined;
    }
  }

  private async onScriptFileCreated(filePath: string): Promise<void> {
    try {
      if (!this.assetTreeRef) {
        console.warn('[AssetBrowserPanel] assetTreeRef is null, cannot select file');
        return;
      }
      const assetTree = this.assetTreeRef as any;
      if (!assetTree.selectPath || typeof assetTree.selectPath !== 'function') {
        console.warn('[AssetBrowserPanel] selectPath method not found on asset tree');
        return;
      }
      await assetTree.selectPath(filePath);
      console.log('[AssetBrowserPanel] Selected newly created script file:', filePath);
    } catch (error) {
      console.error('[AssetBrowserPanel] Failed to select newly created script file:', error);
    }
  }

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
            icon="edit"
            label="Rename"
            title="Rename selected item"
            @click=${this.onRenameClick}
          ></pix3-toolbar-button>
          <pix3-toolbar-button
            icon="trash"
            label="Delete"
            title="Delete selected item"
            @click=${this.onDeleteClick}
          ></pix3-toolbar-button>
        </pix3-toolbar>

        <pix3-asset-tree ${ref(this.setAssetTreeRef)}></pix3-asset-tree>
      </pix3-panel>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-asset-browser-panel': AssetBrowserPanel;
  }
}
