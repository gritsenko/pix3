import { ComponentBase, customElement, html, inject, property, state } from '@/fw';
import { ifDefined } from 'lit/directives/if-defined.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import feather from 'feather-icons';
import type { FileDescriptor } from '@/services/FileSystemAPIService';
import { ProjectService } from '@/services/ProjectService';
import { ResourceManager } from '@/services/ResourceManager';
import { OperationService } from '@/core/operations/OperationService';
import { LoadSceneOperation } from '@/core/operations/LoadSceneOperation';
import './asset-tree.ts.css';

type Node = {
  name: string;
  path: string;
  kind: FileSystemHandleKind;
  children?: Node[] | null; // null = not loaded yet, [] = loaded and empty
  expanded?: boolean;
  editing?: boolean;
};

@customElement('pix3-asset-tree')
export class AssetTree extends ComponentBase {
  @inject(ProjectService)
  private readonly projectService!: ProjectService;
  @inject(ResourceManager)
  private readonly resourceManager!: ResourceManager;
  @inject(OperationService)
  private readonly operationService!: OperationService;

  // root path to show, defaults to project root
  @property({ type: String }) rootPath = '.';

  @state()
  private tree: Node[] = [];

  @state()
  private selectedPath: string | null = null;

  protected async firstUpdated(): Promise<void> {
    await this.loadRoot();
  }

  private async listDirectory(path: string): Promise<FileDescriptor[]> {
    try {
      return await this.projectService.listDirectory(path);
    } catch {
      return [];
    }
  }

  private async loadRoot(): Promise<void> {
    const entries = await this.listDirectory(this.rootPath || '.');
    this.tree = entries
      .map(e => ({
        name: e.name,
        path: e.path,
        kind: e.kind,
        children: e.kind === 'directory' ? null : [],
      }))
      .sort(
        (a, b) =>
          Number(b.kind === 'directory') - Number(a.kind === 'directory') ||
          a.name.localeCompare(b.name)
      );
  }

  private async expandNode(node: Node): Promise<void> {
    if (node.kind !== 'directory') return;
    if (node.children === null) {
      const entries = await this.listDirectory(node.path);
      node.children = entries
        .map(e => ({
          name: e.name,
          path: e.path,
          kind: e.kind,
          children: e.kind === 'directory' ? null : [],
        }))
        .sort(
          (a, b) =>
            Number(b.kind === 'directory') - Number(a.kind === 'directory') ||
            a.name.localeCompare(b.name)
        );
    }
    node.expanded = true;
    // trigger update
    this.tree = [...this.tree];
  }

  private collapseNode(node: Node): void {
    node.expanded = false;
    this.tree = [...this.tree];
  }

  private toggleNode(node: Node): void {
    if (node.expanded) this.collapseNode(node);
    else this.expandNode(node);
  }

  private onNodeActivate(event: MouseEvent, node: Node): void {
    event.preventDefault();
    event.stopPropagation();

    if (node.editing) {
      return;
    }

    if (node.kind === 'directory') {
      if (node.expanded) {
        this.collapseNode(node);
      } else {
        void this.expandNode(node);
      }
      return;
    }

    if (!this.isSceneAsset(node.name)) {
      return;
    }

    void this.loadSceneFromNode(node);
  }

  private isSceneAsset(name: string): boolean {
    return name.toLowerCase().endsWith('.pix3scene');
  }

  private async loadSceneFromNode(node: Node): Promise<void> {
    const resourcePath = this.toResourceUri(node.path);

    if (!resourcePath) {
      console.warn('[AssetTree] Ignoring scene load for empty path', { path: node.path });
      return;
    }

    const sceneId = this.deriveSceneId(resourcePath);

    try {
      await this.operationService.invoke(new LoadSceneOperation({ filePath: resourcePath, sceneId }));
      this.dispatchEvent(
        new CustomEvent('pix3-scene-loaded', {
          detail: { filePath: resourcePath, sceneId },
          bubbles: true,
          composed: true,
        })
      );
    } catch (error) {
      console.error('[AssetTree] Failed to load scene asset', {
        path: node.path,
        resourcePath,
        error,
      });
      this.dispatchEvent(
        new CustomEvent('pix3-scene-load-error', {
          detail: { filePath: resourcePath, sceneId, error },
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  private toResourceUri(path: string): string | null {
    const normalized = path
      .replace(/^[./]+/, '')
      .replace(/\\+/g, '/')
      .trim();
    if (!normalized) {
      return null;
    }
    return normalized.startsWith('res://') ? normalized : `res://${normalized}`;
  }

  private deriveSceneId(resourcePath: string): string {
    const withoutScheme = resourcePath.replace(/^res:\/\//i, '').replace(/^templ:\/\//i, '');
    const withoutExtension = withoutScheme.replace(/\.[^./]+$/i, '');
    const normalized = withoutExtension
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return normalized || 'scene';
  }

  private onSelect(node: Node): void {
    this.selectedPath = node.path;
    this.dispatchEvent(
      new CustomEvent('asset-selected', {
        detail: { path: node.path, kind: node.kind },
        bubbles: true,
        composed: true,
      })
    );
    this.requestUpdate();
  }

  private renderNode(node: Node, depth = 0): ReturnType<typeof html> {
    const isSelected = this.selectedPath === node.path;
    // reduce per-level indent to 0.6rem for a denser tree
    return html`<div
      class="tree-node"
      data-path=${node.path}
      role="treeitem"
      aria-expanded=${ifDefined(
        node.kind === 'directory' ? (node.expanded ? 'true' : 'false') : undefined
      )}
      style="padding-left: ${depth * 0.3}rem;"
    >
      <div
        class="node-row ${isSelected ? 'selected' : ''}"
        @click=${() => this.onSelect(node)}
        @dblclick=${(event: MouseEvent) => this.onNodeActivate(event, node)}
      >
        ${node.kind === 'directory'
          ? html`<button
              class="expander"
              data-expanded=${node.expanded ? 'true' : 'false'}
              @click=${(e: Event) => {
                e.stopPropagation();
                this.toggleNode(node);
              }}
              aria-label="Toggle folder"
            >
              ${this.caretIcon()}
            </button>`
          : html`<span class="expander-placeholder"></span>`}
        ${node.kind === 'directory' ? this.folderIcon(!!node.expanded) : this.fileIcon()}
        ${node.editing
          ? html`<input
              class="node-edit"
              .value=${this._editingValue ?? node.name}
              @input=${(e: Event) => (this._editingValue = (e.target as HTMLInputElement).value)}
              @keydown=${(e: KeyboardEvent) => this.onEditKeyDown(e, node)}
              @blur=${() => this.commitCreateFolder(node)}
            />`
          : html`<span class="node-name">${node.name}</span>`}
        <span class="node-kind">${node.kind}</span>
      </div>
      ${node.expanded && node.children && node.children.length
        ? html`<div class="node-children" role="group">
            ${node.children.map(child => this.renderNode(child, depth + 1))}
          </div>`
        : null}
    </div>`;
  }

  private folderIcon(open: boolean) {
    const title = open ? 'Open folder' : 'Closed folder';
    return html`<span class="icon folder" role="img" aria-label=${title} title=${title}>
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path
          d="M3 7C3 5.89543 3.89543 5 5 5H9L11 8H19C20.1046 8 21 8.89543 21 10V17C21 18.1046 20.1046 19 19 19H5C3.89543 19 3 18.1046 3 17V7Z"
          fill="currentColor"
          opacity="0.95"
        />
        ${open ? html`<path d="M3 7L7 11H21" stroke="rgba(0,0,0,0.08)" stroke-width="0" />` : null}
      </svg>
    </span>`;
  }

  private fileIcon() {
    const title = 'File';
    return html`<span class="icon file" role="img" aria-label=${title} title=${title}>
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path
          d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z"
          fill="currentColor"
          opacity="0.95"
        />
        <path d="M14 2V8H20" fill="rgba(0,0,0,0.06)" />
      </svg>
    </span>`;
  }

  private caretIcon() {
    return html`<svg
      class="caret"
      viewBox="0 0 12 12"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M4 2L8 6L4 10"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="none"
        style="opacity:0.5"
      />
    </svg>`;
  }

  protected render() {
    return html`<div class="asset-tree-root">
      <div class="toolbar" role="toolbar" aria-label="Assets toolbar">
        <button
          class="tb-btn"
          @click=${this.onCreateFolder}
          title="Create folder"
          aria-label="Create folder"
        >
          <span class="tb-icon folder"
            >${unsafeSVG(feather.icons['folder-plus'].toSvg({ width: 18, height: 18 }))}</span
          >
        </button>

        <div class="tb-dropdown">
          <button
            class="tb-btn"
            @click=${this.toggleCreateAssetMenu}
            aria-haspopup="menu"
            aria-expanded=${ifDefined(this._createAssetOpen ? 'true' : 'false')}
            title="Create asset"
            aria-label="Create asset"
          >
            <span class="tb-icon file"
              >${unsafeSVG(feather.icons['file-plus'].toSvg({ width: 18, height: 18 }))}</span
            >
            <svg viewBox="0 0 12 12" class="small-caret" aria-hidden="true">
              <path
                d="M3 4L6 7L9 4"
                stroke="currentColor"
                stroke-width="1.2"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
              />
            </svg>
          </button>
          ${this._createAssetOpen
            ? html`<div class="menu" role="menu">
                <button role="menuitem" class="menu-item" @click=${() => this.startCreateScene()}>
                  Scene
                </button>
              </div>`
            : null}
        </div>
      </div>

      <div class="tree" role="tree" aria-label="Assets">
        ${this.tree.length === 0
          ? html`<p class="empty">No assets</p>`
          : this.tree.map(n => this.renderNode(n))}
      </div>
    </div>`;
  }

  private _createAssetOpen = false;
  private _editingValue: string | null = null;

  private toggleCreateAssetMenu = (e: Event) => {
    e.stopPropagation();
    this._createAssetOpen = !this._createAssetOpen;
    this.requestUpdate();
  };

  private onCreateFolder = (e: Event) => {
    e.stopPropagation();
    // initiate create-folder flow in UI
    this.startCreateFolder();
  };

  private startCreateScene(): void {
    // similar to startCreateFolder but for scene file
    const selected = this.selectedPath ? this.findNodeByPath(this.selectedPath) : null;
    const parentPath =
      selected && selected.node && selected.node.kind === 'directory' ? selected.node.path : '.';

    // ensure parent children loaded
    const parentNode =
      selected && selected.node && selected.node.kind === 'directory' ? selected.node : null;

    const newName = 'New Scene';
    const newPath = this.joinPath(parentPath, `${newName}.pix3scene`);
    const newNode: Node = {
      name: `${newName}.pix3scene`,
      path: newPath,
      kind: 'file',
      children: [],
      editing: true,
    };

    if (parentNode) {
      parentNode.children = parentNode.children || [];
      parentNode.children.unshift(newNode);
      parentNode.expanded = true;
    } else {
      this.tree.unshift(newNode);
    }

    this._editingValue = newNode.name;
    this.selectedPath = newPath;
    this.requestUpdate();

    this.updateComplete.then(() => {
      const input = this.renderRoot.querySelector('.node-edit') as HTMLInputElement | null;
      if (input) {
        input.focus();
        input.select();
      }
    });
  }

  private async startCreateFolder(): Promise<void> {
    // determine parent path
    const selected = this.selectedPath ? this.findNodeByPath(this.selectedPath) : null;
    const parentPath =
      selected && selected.node && selected.node.kind === 'directory' ? selected.node.path : '.';

    // ensure parent is expanded and children loaded
    let parentNode =
      selected && selected.node && selected.node.kind === 'directory' ? selected.node : null;
    if (parentNode && parentNode.children === null) {
      await this.expandNode(parentNode);
    }

    const newName = 'New Folder';
    const newPath = this.joinPath(parentPath, newName);
    const newNode: Node = {
      name: newName,
      path: newPath,
      kind: 'directory',
      children: [],
      editing: true,
    };

    if (parentNode) {
      parentNode.children = parentNode.children || [];
      parentNode.children.unshift(newNode);
      parentNode.expanded = true;
    } else {
      // root
      this.tree.unshift(newNode);
    }

    this._editingValue = newName;
    this.selectedPath = newPath;
    this.requestUpdate();

    // focus input after render
    await this.updateComplete;
    const input = this.renderRoot.querySelector('.node-edit') as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.select();
    }
  }

  private onEditKeyDown(e: KeyboardEvent, node: Node) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.cancelCreateFolder(node);
    } else if (e.key === 'Enter') {
      e.stopPropagation();
      this.commitCreateFolder(node);
    }
  }

  private async cancelCreateFolder(node: Node) {
    // remove the temporary node
    const removed = this.removeNodeByPath(node.path);
    this._editingValue = null;
    if (removed) {
      this.requestUpdate();
    }
  }

  private async commitCreateFolder(node: Node) {
    const finalName = (this._editingValue ?? node.name).trim();
    if (!finalName) {
      await this.cancelCreateFolder(node);
      return;
    }
    // create folder or file via ProjectService
    try {
      const parentPath = this.getParentPath(node.path);
      const createdPath = this.joinPath(parentPath === '.' ? '' : parentPath, finalName);

      if (node.kind === 'directory') {
        await this.projectService.createDirectory(createdPath);
      } else if (node.kind === 'file') {
        // ensure extension
        let filename = finalName;
        if (!filename.endsWith('.pix3scene')) filename = `${filename}.pix3scene`;
        const filePath = this.joinPath(parentPath === '.' ? '' : parentPath, filename);
        // read template via ResourceManager and write
        const template = await this.resourceManager.readText('templ://startup-scene');
        await this.projectService.writeFile(filePath, template);
      }

      // refresh parent in UI
      if (parentPath === '.' || parentPath === '') {
        await this.loadRoot();
      } else {
        const parentNodeEntry = this.findNodeByPath(parentPath);
        if (parentNodeEntry && parentNodeEntry.node) {
          parentNodeEntry.node.children = null;
          await this.expandNode(parentNodeEntry.node);
        }
      }

      this.selectedPath = createdPath.replace(/^\//, '');
      this._editingValue = null;
      this.requestUpdate();
    } catch (err) {
      console.error('Failed to create folder', err);
      // remove temp node
      await this.cancelCreateFolder(node);
    }
  }

  private getParentPath(path: string): string {
    const parts = path.split('/').filter(p => p.length > 0);
    if (parts.length <= 1) return '.';
    return parts.slice(0, -1).join('/');
  }

  private joinPath(base: string, name: string): string {
    if (!base || base === '.' || base === '') return name;
    return `${base.replace(/\/+$/, '')}/${name}`;
  }

  private findNodeByPath(path: string): { node?: Node; parent?: Node | null } | null {
    const stack: Array<{ node: Node; parent: Node | null }> = this.tree.map(n => ({
      node: n,
      parent: null,
    }));
    while (stack.length) {
      const { node, parent } = stack.shift()!;
      if (node.path === path) return { node, parent };
      if (node.children && node.children.length) {
        for (const child of node.children) stack.push({ node: child, parent: node });
      }
    }
    return null;
  }

  private removeNodeByPath(path: string): boolean {
    // try root
    const idx = this.tree.findIndex(n => n.path === path);
    if (idx >= 0) {
      this.tree.splice(idx, 1);
      this.tree = [...this.tree];
      return true;
    }
    // recurse
    const walk = (nodes: Node[]): boolean => {
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.path === path) {
          nodes.splice(i, 1);
          return true;
        }
        if (n.children && n.children.length) {
          if (walk(n.children)) return true;
        }
      }
      return false;
    };
    const removed = walk(this.tree);
    if (removed) this.tree = [...this.tree];
    return removed;
  }

  // create-asset event no longer used here; menu directly starts creation flows
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-asset-tree': AssetTree;
  }
}
