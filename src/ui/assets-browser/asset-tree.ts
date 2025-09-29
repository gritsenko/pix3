import { ComponentBase, css, customElement, html, inject, property, state } from '@/fw';
import { ifDefined } from 'lit/directives/if-defined.js';
import type { FileDescriptor } from '../../services/FileSystemAPIService';
import { ProjectService } from '../../services/ProjectService';

type Node = {
  name: string;
  path: string;
  kind: FileSystemHandleKind;
  children?: Node[] | null; // null = not loaded yet, [] = loaded and empty
  expanded?: boolean;
};

@customElement('pix3-asset-tree')
export class AssetTree extends ComponentBase {
  @inject(ProjectService)
  private readonly projectService!: ProjectService;

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
      // ProjectService delegates to FileSystemAPIService
      // Use normalized path logic if needed later
      // Note: ProjectService exposes listProjectRoot only; call via internal fs if necessary
      // For now, request listing relative to provided path using ProjectService's FS service
      // We can resolve via (this.projectService as any).fs which holds the FileSystemAPIService
      const fs = (this.projectService as any).fs as import('../../services/FileSystemAPIService').FileSystemAPIService;
      return await fs.listDirectory(path);
    } catch {
      return [];
    }
  }

  private async loadRoot(): Promise<void> {
    const entries = await this.listDirectory(this.rootPath || '.');
    this.tree = entries
      .map(e => ({ name: e.name, path: e.path, kind: e.kind, children: e.kind === 'directory' ? null : [] }))
      .sort((a, b) => Number(b.kind === 'directory') - Number(a.kind === 'directory') || a.name.localeCompare(b.name));
  }

  private async expandNode(node: Node): Promise<void> {
    if (node.kind !== 'directory') return;
    if (node.children === null) {
      const entries = await this.listDirectory(node.path);
      node.children = entries
        .map(e => ({ name: e.name, path: e.path, kind: e.kind, children: e.kind === 'directory' ? null : [] }))
        .sort((a, b) => Number(b.kind === 'directory') - Number(a.kind === 'directory') || a.name.localeCompare(b.name));
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

  private onSelect(node: Node): void {
    this.selectedPath = node.path;
    this.dispatchEvent(new CustomEvent('asset-selected', { detail: { path: node.path, kind: node.kind }, bubbles: true, composed: true }));
    this.requestUpdate();
  }

  private renderNode(node: Node, depth = 0): ReturnType<typeof html> {
    const isSelected = this.selectedPath === node.path;
    // reduce per-level indent to 0.6rem for a denser tree
    return html`<div class="tree-node" role="treeitem" aria-expanded=${ifDefined(
      node.kind === 'directory' ? (node.expanded ? 'true' : 'false') : undefined
    )} style="padding-left: ${depth * 0.3}rem;">
        <div class="node-row ${isSelected ? 'selected' : ''}" @click=${() => (node.kind === 'directory' ? this.toggleNode(node) : this.onSelect(node))}>
          ${node.kind === 'directory'
            ? html`<button class="expander" data-expanded=${node.expanded ? 'true' : 'false'} @click=${(e: Event) => { e.stopPropagation(); this.toggleNode(node); }} aria-label="Toggle folder">
                ${this.caretIcon()}
              </button>`
            : html`<span class="expander-placeholder"></span>`}
          ${node.kind === 'directory' ? this.folderIcon(!!node.expanded) : this.fileIcon()}
          <span class="node-name">${node.name}</span>
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
        <path d="M3 7C3 5.89543 3.89543 5 5 5H9L11 8H19C20.1046 8 21 8.89543 21 10V17C21 18.1046 20.1046 19 19 19H5C3.89543 19 3 18.1046 3 17V7Z" fill="currentColor" opacity="0.95"/>
        ${open
          ? html`<path d="M3 7L7 11H21" stroke="rgba(0,0,0,0.08)" stroke-width="0"/>`
          : null}
      </svg>
    </span>`;
  }

  private fileIcon() {
    const title = 'File';
    return html`<span class="icon file" role="img" aria-label=${title} title=${title}>
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" fill="currentColor" opacity="0.95"/>
        <path d="M14 2V8H20" fill="rgba(0,0,0,0.06)"/>
      </svg>
    </span>`;
  }

  private caretIcon() {
    return html`<svg class="caret" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M4 2L8 6L4 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" style="opacity:0.5" />
    </svg>`;
  }

  protected render() {
    return html`<div class="tree" role="tree" aria-label="Assets">
      ${this.tree.length === 0 ? html`<p class="empty">No assets</p>` : this.tree.map(n => this.renderNode(n))}
    </div>`;
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }

    .tree {
      height: 100%;
      overflow: auto;
      min-height: 0; /* allow flex children to shrink */
      display: block;
      padding-right: 0.25rem;
      /* Themed scrollbar matching panel dark scheme */
    }

    /* WebKit-based browsers */
    .tree::-webkit-scrollbar {
      width: 12px;
      background: transparent;
    }

    .tree::-webkit-scrollbar-track {
      background: rgba(0,0,0,0.25);
      border-radius: 6px;
    }

    .tree::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, rgba(80,80,80,0.7), rgba(48,48,48,0.7));
      border-radius: 6px;
      border: 2px solid rgba(0,0,0,0.18);
    }

    /* Firefox */
    .tree {
      scrollbar-width: thin;
      scrollbar-color: rgba(80,80,80,0.7) rgba(0,0,0,0.25);
    }

    .tree-node {
      display: block;
    }

    .node-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      cursor: pointer;
    }

    .icon {
      width: 1.1rem;
      height: 1.1rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: rgba(245,247,250,0.9);
    }

    .icon.folder {
      /* Windows Explorer like folder yellow */
      color: #F2C94C;
    }

    /* .icon.folder svg path left intentionally empty to allow future fine-tuning of folder svg strokes */

    .expander svg, .expander-placeholder svg {
      width: 1rem;
      height: 1rem;
      display: block;
    }

    .node-row:hover {
      background: rgba(255,255,255,0.02);
    }

    .node-row.selected {
      background: rgba(48, 164, 255, 0.14);
      outline: 1px solid rgba(48,164,255,0.18);
    }

    .expander {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      width: 1.1rem;
      text-align: center;
      padding: 0;
    }

    .caret {
      width: 0.9rem;
      height: 0.9rem;
      display: inline-block;
      transform-origin: 50% 50%;
      transition: transform 120ms ease-in-out;
    }

    .expander[data-expanded='true'] .caret {
      transform: rotate(90deg);
    }

    .expander:focus {
      outline: none;
      box-shadow: 0 0 0 2px rgba(94, 194, 255, 0.6);
    }

    .expander-placeholder {
      display: inline-block;
      width: 1.1rem;
    }

    .node-name {
      flex: 1 1 auto;
      font-size: 0.9rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .node-kind {
      color: rgba(255,255,255,0.5);
      font-size: 0.78rem;
      margin-left: 0.5rem;
    }

    .empty {
      margin: 0;
      color: rgba(245,247,250,0.6);
      font-style: italic;
      padding: 0.5rem 0.25rem;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-asset-tree': AssetTree;
  }
}
