import { ComponentBase, customElement, html, inject, property, state } from '@/fw';
import { ifDefined } from 'lit/directives/if-defined.js';
import type { AssetActivation } from '@/services';
import type { FileDescriptor } from '@/services/FileSystemAPIService';
import { ProjectService } from '@/services/ProjectService';
import { ResourceManager } from '@/services/ResourceManager';
import { DialogService } from '@/services/DialogService';
import { IconService } from '@/services/IconService';
import { appState } from '@/state';
import { subscribe } from 'valtio/vanilla';
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
  @inject(DialogService)
  private readonly dialogService!: DialogService;
  @inject(IconService)
  private readonly iconService!: IconService;
  // Parent will handle actions via 'asset-activate' event

  // root path to show, defaults to project root
  @property({ type: String }) rootPath = '.';

  @state()
  private tree: Node[] = [];

  @state()
  private selectedPath: string | null = null;

  @state()
  private draggedPath: string | null = null;

  @state()
  private dragOverPath: string | null = null;

  @state()
  private isExternalDrag: boolean = false;

  // Click-and-wait rename behavior
  private _lastClickedPath: string | null = null;
  private _renameTimer: number | null = null;
  private readonly _renameDelay = 500; // milliseconds

  private disposeSubscription?: () => void;

  private previousRootSignature: string | null = null;

  private onWindowFocus = async (): Promise<void> => {
    await this.checkForExternalChanges();
  };

  private onVisibilityChange = async (): Promise<void> => {
    if (document.visibilityState === 'visible') {
      await this.checkForExternalChanges();
    }
  };

  public async createFolder(): Promise<void> {
    await this.startCreateFolder();
  }

  private async buildRootSignature(): Promise<string> {
    try {
      const paths: string[] = [];
      const collect = async (path: string) => {
        const entries = await this.listDirectory(path || '.');
        for (const e of entries) {
          paths.push(`${e.path}:${e.kind}`);
          if (e.kind === 'directory') {
            await collect(e.path);
          }
        }
      };
      await collect(this.rootPath || '.');
      return paths.sort().join('|');
    } catch {
      return '';
    }
  }

  private async checkForExternalChanges(): Promise<void> {
    try {
      const signature = await this.buildRootSignature();
      if (this.previousRootSignature === null) {
        this.previousRootSignature = signature;
        return;
      }

      if (this.previousRootSignature !== signature) {
        console.debug('[AssetTree] External changes detected, refreshing root');
        this.previousRootSignature = signature;
        await this.loadRoot();
      }
    } catch (err) {
      console.error('[AssetTree] Failed to check external changes', err);
    }
  }

  public createScene(): void {
    this.startCreateScene();
  }

  public async deleteSelected(): Promise<void> {
    if (!this.selectedPath) {
      console.warn('[AssetTree] No item selected for deletion');
      return;
    }
    await this.deleteEntry(this.selectedPath);
  }

  public async renameSelected(): Promise<void> {
    if (!this.selectedPath) {
      console.warn('[AssetTree] No item selected for rename');
      return;
    }
    await this.startRename(this.selectedPath);
  }

  protected async firstUpdated(): Promise<void> {
    await this.loadRoot();
    // Subscribe only to lastModifiedDirectoryPath changes (file system changes)
    // Do not subscribe to lastOpenedScenePath (scene loading UI state)
    let previousModifiedDir = appState.project.lastModifiedDirectoryPath;
    this.disposeSubscription = subscribe(appState.project, async () => {
      const modifiedDir = appState.project.lastModifiedDirectoryPath;
      // Only refresh if lastModifiedDirectoryPath actually changed
      if (modifiedDir !== previousModifiedDir) {
        console.debug('[AssetTree] Project file refresh signal received', {
          modifiedDirectory: modifiedDir,
        });
        previousModifiedDir = modifiedDir;
        if (modifiedDir) {
          // Refresh only the affected directory
          await this.refreshDirectory(modifiedDir);
        } else {
          // If no specific directory indicated, refresh root
          await this.loadRoot();
        }
      }
    });

    // Initialize previous signature
    this.previousRootSignature = await this.buildRootSignature();

    // Listen for window focus and visibility changes to detect external file changes
    window.addEventListener('focus', this.onWindowFocus);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    // Listen for window focus and visibility changes to detect external file changes
    window.addEventListener('focus', this.onWindowFocus);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.disposeSubscription?.();

    this.clearRenameTimer();
    this._lastClickedPath = null;

    window.removeEventListener('focus', this.onWindowFocus);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
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

  private async refreshDirectory(targetPath: string): Promise<void> {
    // Find and refresh only the specific directory node
    const refreshNode = async (nodes: Node[]): Promise<boolean> => {
      for (const node of nodes) {
        if (node.path === targetPath && node.kind === 'directory') {
          // Reload this directory's children
          console.debug('[AssetTree] Refreshing directory', { path: targetPath });
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
          // Trigger update
          this.tree = [...this.tree];
          return true;
        }
        // Recursively search in children
        if (node.children && node.children.length > 0) {
          if (await refreshNode(node.children)) {
            return true;
          }
        }
      }
      return false;
    };

    const found = await refreshNode(this.tree);
    if (!found) {
      console.debug('[AssetTree] Directory not found in tree, refreshing root', {
        targetPath,
      });
      await this.loadRoot();
    }
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

  private clearRenameTimer(): void {
    if (this._renameTimer) {
      clearTimeout(this._renameTimer);
      this._renameTimer = null;
    }
  }

  private onSelect(node: Node, options?: { suppressRename?: boolean }): void {
    const isSameNode = this._lastClickedPath === node.path;
    const isAlreadySelected = this.selectedPath === node.path;

    this.clearRenameTimer();

    const shouldStartRename = !options?.suppressRename && isSameNode && isAlreadySelected;

    if (shouldStartRename) {
      this._lastClickedPath = node.path;
      this._renameTimer = window.setTimeout(() => {
        this.clearRenameTimer();
        this._lastClickedPath = null;
        void this.startRename(node.path);
      }, this._renameDelay);
    } else if (isSameNode) {
      this._lastClickedPath = null;
      this.selectedPath = node.path;
      this.dispatchEvent(
        new CustomEvent('asset-selected', {
          detail: { path: node.path, kind: node.kind },
          bubbles: true,
          composed: true,
        })
      );
    } else {
      this.selectedPath = node.path;
      this.dispatchEvent(
        new CustomEvent('asset-selected', {
          detail: { path: node.path, kind: node.kind },
          bubbles: true,
          composed: true,
        })
      );

      this._lastClickedPath = node.path;
    }

    this.requestUpdate();
  }

  private onNodeDoubleClick(event: MouseEvent, node: Node): void {
    event.preventDefault();
    event.stopPropagation();
    this.clearRenameTimer();
    this._lastClickedPath = null;
    if (node.kind === 'directory') {
      this.toggleNode(node);
      return;
    }
    this.activateAsset(node);
  }

  private onNodeKeyDown(event: KeyboardEvent, node: Node): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onSelect(node, { suppressRename: true });
      if (event.key === 'Enter') {
        this.activateAsset(node);
      }
    }
  }

  private activateAsset(node: Node): void {
    if (node.kind !== 'file') {
      return;
    }

    const normalizedPath = this.normalizeTreePath(node.path);
    if (!normalizedPath) {
      console.warn('[AssetTree] Asset path is empty', node);
      return;
    }

    const activation: AssetActivation = {
      name: node.name,
      path: node.path,
      kind: node.kind,
      resourcePath: this.buildResourcePath(normalizedPath),
      extension: this.getFileExtension(node.name),
    };

    this.dispatchEvent(
      new CustomEvent<AssetActivation>('asset-activate', {
        detail: activation,
        bubbles: true,
        composed: true,
      })
    );
  }

  private buildResourcePath(normalizedPath: string): string {
    return `res://${normalizedPath}`;
  }

  private normalizeTreePath(path: string): string {
    return path.replace(/^(\.?\/)+/, '').replace(/^\/+/, '');
  }

  private getFileExtension(name: string): string {
    const lastDot = name.lastIndexOf('.');
    if (lastDot === -1 || lastDot === name.length - 1) {
      return '';
    }
    return name.substring(lastDot + 1).toLowerCase();
  }

  private renderNode(node: Node, depth = 0): ReturnType<typeof html> {
    const isSelected = this.selectedPath === node.path;
    const isDragOver = this.dragOverPath === node.path && node.kind === 'directory';
    return html`<div
      class="tree-node"
      data-path=${node.path}
      role="treeitem"
      aria-expanded=${ifDefined(
        node.kind === 'directory' ? (node.expanded ? 'true' : 'false') : undefined
      )}
    >
      <div
        class="node-row ${isSelected ? 'selected' : ''} ${isDragOver ? 'drag-over' : ''}"
        @click=${() => this.onSelect(node)}
        @dblclick=${(e: MouseEvent) => this.onNodeDoubleClick(e, node)}
        @keydown=${(e: KeyboardEvent) => this.onNodeKeyDown(e, node)}
        @dragstart=${(e: DragEvent) => this.onDragStart(e, node)}
        @dragend=${(e: DragEvent) => this.onDragEnd(e)}
        @dragover=${(e: DragEvent) => this.onDragOver(e, node)}
        @dragleave=${(e: DragEvent) => this.onDragLeave(e, node)}
        @drop=${(e: DragEvent) => this.onDrop(e, node)}
        draggable="true"
        tabindex="0"
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

  private onDragStart(e: DragEvent, node: Node): void {
    // Prevent dragging while editing
    if (node.editing) {
      e.preventDefault();
      return;
    }

    this.draggedPath = node.path;
    this.isExternalDrag = false;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', node.path);
    }
  }

  private onDragEnd(_e: DragEvent): void {
    this.draggedPath = null;
    this.dragOverPath = null;
  }

  private onDragOver(_e: DragEvent, node: Node): void {
    // Check if this is an external drag (files from outside browser)
    if (_e.dataTransfer?.items && _e.dataTransfer.items.length > 0) {
      const hasFiles = Array.from(_e.dataTransfer.items).some(item => item.kind === 'file');
      if (hasFiles) {
        this.isExternalDrag = true;
        // Only allow dropping on directories for external files
        if (node.kind !== 'directory') {
          return;
        }
        _e.preventDefault();
        if (_e.dataTransfer) {
          _e.dataTransfer.dropEffect = 'copy';
        }
        this.dragOverPath = node.path;
        return;
      }
    }

    // Handle internal drag (existing logic)
    // Only allow dropping on directories
    if (node.kind !== 'directory' || this.draggedPath === node.path) {
      return;
    }

    _e.preventDefault();
    if (_e.dataTransfer) {
      _e.dataTransfer.dropEffect = 'move';
    }

    // Clear tree root highlight when hovering over a specific node
    this.dragOverPath = node.path;
  }

  private onDragLeave(_e: DragEvent, node: Node): void {
    // Only clear drag over if we're actually leaving this node
    if (this.dragOverPath === node.path) {
      // Use a small delay to allow tree root drag over to take precedence
      setTimeout(() => {
        if (this.dragOverPath === node.path) {
          this.dragOverPath = null;
        }
      }, 10);
    }
  }

  private onTreeDragOver(e: DragEvent): void {
    // Check if this is an external drag (files from outside browser)
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      const hasFiles = Array.from(e.dataTransfer.items).some(item => item.kind === 'file');
      if (hasFiles) {
        this.isExternalDrag = true;
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'copy';
        }
        // Only set tree root drag over if we're not already over a specific node
        if (!this.dragOverPath || this.dragOverPath === '__TREE_ROOT__') {
          this.dragOverPath = '__TREE_ROOT__';
        }
        return;
      }
    }

    // Handle internal drag (existing logic)
    if (!this.draggedPath) {
      return;
    }

    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }

    // Only set tree root drag over if we're not already over a specific node
    if (!this.dragOverPath || this.dragOverPath === '__TREE_ROOT__') {
      this.dragOverPath = '__TREE_ROOT__';
    }
  }

  private onTreeDragLeave(_e: DragEvent): void {
    // Clear drag over state if we're leaving the tree area
    // Use a small delay to allow node drag over to take precedence
    setTimeout(() => {
      if (this.dragOverPath === '__TREE_ROOT__') {
        this.dragOverPath = null;
      }
    }, 10);
  }

  private async onTreeDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    e.stopPropagation();

    this.dragOverPath = null;

    // Check if this is an external file drop
    if (this.isExternalDrag && e.dataTransfer?.items) {
      await this.handleExternalFileDrop(e.dataTransfer.items, '.');
      this.isExternalDrag = false;
      return;
    }

    // Handle internal drag (existing logic)
    const sourcePath = e.dataTransfer?.getData('text/plain');
    if (!sourcePath) {
      return;
    }

    // Don't allow moving to root if already at root
    const sourceParent = this.getParentPath(sourcePath);
    if (sourceParent === '.' || sourceParent === '') {
      return;
    }

    // Show confirmation dialog
    const sourceName = sourcePath.split('/').pop() || sourcePath;

    try {
      const confirmed = await this.dialogService.showConfirmation({
        title: 'Move to Root?',
        message: `Move "${sourceName}" to the project root?`,
        confirmLabel: 'Move',
        cancelLabel: 'Cancel',
        isDangerous: false,
      });

      if (confirmed) {
        await this.performMove(sourcePath, '.');
      }
    } catch (error) {
      console.error('[AssetTree] Error during move to root operation:', error);
    }
  }

  private async onDrop(e: DragEvent, targetNode: Node): Promise<void> {
    e.preventDefault();
    e.stopPropagation();

    this.dragOverPath = null;

    // Check if this is an external file drop
    if (this.isExternalDrag && e.dataTransfer?.items) {
      await this.handleExternalFileDrop(e.dataTransfer.items, targetNode.path);
      this.isExternalDrag = false;
      return;
    }

    // Handle internal drag (existing logic)
    const sourcePath = e.dataTransfer?.getData('text/plain');
    if (!sourcePath || sourcePath === targetNode.path || targetNode.kind !== 'directory') {
      return;
    }

    // Show confirmation dialog
    const sourceName = sourcePath.split('/').pop() || sourcePath;
    const targetName = targetNode.name;

    try {
      const confirmed = await this.dialogService.showConfirmation({
        title: 'Move Item?',
        message: `Move "${sourceName}" to "${targetName}"?`,
        confirmLabel: 'Move',
        cancelLabel: 'Cancel',
        isDangerous: false,
      });

      if (confirmed) {
        await this.performMove(sourcePath, targetNode.path);
      }
    } catch (error) {
      console.error('[AssetTree] Error during move operation:', error);
    }
  }

  private async performMove(sourcePath: string, targetDirPath: string): Promise<void> {
    try {
      const sourceName = sourcePath.split('/').pop() || sourcePath;
      const targetPath = this.joinPath(targetDirPath === '.' ? '' : targetDirPath, sourceName);

      console.log('[AssetTree] Moving', { sourcePath, targetPath });

      // Use ProjectService to move the file/folder
      await this.projectService.moveItem(sourcePath, targetPath);

      // Refresh both source parent and target directory
      const sourceParent = this.getParentPath(sourcePath);
      const targetParent = targetDirPath;

      // Refresh source parent
      if (sourceParent === '.' || sourceParent === '') {
        await this.loadRoot();
      } else {
        await this.refreshDirectory(sourceParent);
      }

      // Refresh target if different from source
      if (targetParent !== sourceParent) {
        if (targetParent === '.' || targetParent === '') {
          // Refresh root to show the moved item
          await this.loadRoot();
        } else {
          await this.refreshDirectory(targetParent);
        }
      }

      this.selectedPath = targetPath;
      console.log('[AssetTree] Move completed successfully');
    } catch (error) {
      console.error('[AssetTree] Failed to move item:', error);
    }
  }

  private async handleExternalFileDrop(
    items: DataTransferItemList,
    targetPath: string
  ): Promise<void> {
    try {
      // Get files from dataTransfer (simplified approach)
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }

      if (files.length === 0) {
        return;
      }

      // Show confirmation dialog for multiple files
      const message =
        files.length === 1
          ? `Copy "${files[0].name}" to "${targetPath === '.' ? 'project root' : targetPath}"?`
          : `Copy ${files.length} items to "${targetPath === '.' ? 'project root' : targetPath}"?`;

      const confirmed = await this.dialogService.showConfirmation({
        title: 'Copy Files?',
        message,
        confirmLabel: 'Copy',
        cancelLabel: 'Cancel',
        isDangerous: false,
      });

      if (!confirmed) {
        return;
      }

      // Process each file
      for (const file of files) {
        await this.copyExternalFile(file, targetPath);
      }

      // Refresh target directory
      if (targetPath === '.' || targetPath === '') {
        await this.loadRoot();
      } else {
        await this.refreshDirectory(targetPath);
      }

      console.log(
        `[AssetTree] Successfully copied ${files.length} external files to ${targetPath}`
      );
    } catch (error) {
      console.error('[AssetTree] Error handling external file drop:', error);
    }
  }

  private async copyExternalFile(file: File, targetPath: string): Promise<void> {
    try {
      // Handle directory structure in file name
      const fullPath = this.joinPath(targetPath === '.' ? '' : targetPath, file.name);
      console.log(`[AssetTree] Copying file ${file.name} to ${fullPath}`);

      // If file contains path separators, create directories
      const pathParts = fullPath.split('/');
      if (pathParts.length > 1) {
        const dirPath = pathParts.slice(0, -1).join('/');
        console.log(`[AssetTree] Creating directory structure: ${dirPath}`);
        await this.projectService.createDirectory(dirPath);
      }

      // Read file content and write to project
      if (
        file.type.startsWith('text/') ||
        file.name.endsWith('.json') ||
        file.name.endsWith('.pix3scene')
      ) {
        // Text files
        const content = await file.text();
        await this.projectService.writeFile(fullPath, content);
      } else {
        // Binary files
        const arrayBuffer = await file.arrayBuffer();
        await this.projectService.writeBinaryFile(fullPath, arrayBuffer);
      }

      console.log(`[AssetTree] Copied external file: ${file.name} to ${fullPath}`);
    } catch (error) {
      console.error(`[AssetTree] Failed to copy external file ${file.name}:`, error);
      throw error;
    }
  }

  private folderIcon(open: boolean) {
    const title = open ? 'Open folder' : 'Closed folder';

    return html`<span class="icon folder" role="img" aria-label=${title} title=${title}>
      ${this.iconService.getIcon('folder-solid', 24)}
    </span>`;
  }

  private fileIcon() {
    const title = 'File';
    return html`<span class="icon file" role="img" aria-label=${title} title=${title}>
      ${this.iconService.getIcon('file-solid', 24)}
    </span>`;
  }

  private caretIcon() {
    return this.iconService.getIcon('chevron-right-caret', 12);
  }

  protected render() {
    const isDragOverRoot = this.dragOverPath === '__TREE_ROOT__';
    return html`<div class="asset-tree-root">
      <div
        class="tree ${isDragOverRoot ? 'drag-over-root' : ''}"
        role="tree"
        aria-label="Assets"
        @dragover=${this.onTreeDragOver}
        @dragleave=${this.onTreeDragLeave}
        @drop=${this.onTreeDrop}
      >
        ${this.tree.length === 0
          ? html`<p class="empty">No assets</p>`
          : this.tree.map(n => this.renderNode(n))}
      </div>
    </div>`;
  }

  private async startRename(path: string): Promise<void> {
    const nodeEntry = this.findNodeByPath(path);
    if (!nodeEntry || !nodeEntry.node) {
      console.warn('[AssetTree] Node not found for rename:', path);
      return;
    }

    this.clearRenameTimer();
    this._lastClickedPath = null;

    const node = nodeEntry.node;
    node.editing = true;

    // Cache the original file extension for rename operations
    const originalName = node.name;
    const lastDotIndex = originalName.lastIndexOf('.');
    this._originalExtension = lastDotIndex > -1 ? originalName.substring(lastDotIndex) : '';
    this._isNewScene = false; // This is a rename, not new scene creation

    // For files, show name without extension for cleaner editing
    this._editingValue = lastDotIndex > -1 ? originalName.substring(0, lastDotIndex) : originalName;
    this.requestUpdate();

    // focus input after render
    await this.updateComplete;
    const input = this.renderRoot.querySelector('.node-edit') as HTMLInputElement | null;
    if (input) {
      input.focus();
      input.select();
    }
  }

  private _editingValue: string | null = null;

  // Cache original extension and operation type for rename operations
  private _originalExtension: string = '';
  private _isNewScene: boolean = true;

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

    // For new scene creation, force .pix3scene extension
    this._isNewScene = true;
    this._originalExtension = '.pix3scene';
    this._editingValue = newName; // Show without extension for editing
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

    // For folder creation, no extension needed
    this._isNewScene = false;
    this._originalExtension = '';
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
      e.preventDefault(); // Prevent any default form submission or other behavior
      e.stopPropagation();
      this.commitCreateFolder(node);
    }
  }

  private async cancelCreateFolder(node: Node) {
    // remove the temporary node
    const removed = this.removeNodeByPath(node.path);
    this._editingValue = null;
    this._originalExtension = '';
    this._isNewScene = true;
    if (removed) {
      this.requestUpdate();
    }
  }

  private _committing = false;

  private async commitCreateFolder(node: Node) {
    // Prevent double execution
    if (this._committing) {
      return;
    }
    this._committing = true;

    let isRename = false;

    try {
      const finalName = (this._editingValue ?? node.name).trim();

      // Check if this is a rename (existing node) or create (new node)
      // by checking if the file exists in the filesystem
      const parentPath = this.getParentPath(node.path);
      const entries = await this.listDirectory(parentPath === '.' ? '.' : parentPath);
      const existingEntry = entries.find(e => e.path === node.path);
      isRename = !!existingEntry;

      // If this is a rename and the name is empty or unchanged, just cancel editing
      if (isRename) {
        const originalName = node.name;
        const finalNameWithoutExt = finalName.includes('.')
          ? finalName.substring(0, finalName.lastIndexOf('.'))
          : finalName;
        const originalNameWithoutExt = originalName.includes('.')
          ? originalName.substring(0, originalName.lastIndexOf('.'))
          : originalName;

        if (!finalName || finalNameWithoutExt === originalNameWithoutExt) {
          // Just cancel editing without deleting the existing folder
          node.editing = false;
          this._editingValue = null;
          this._originalExtension = '';
          this._isNewScene = true;
          this.requestUpdate();
          return;
        }
      } else {
        // For new items, empty name means cancel creation
        if (!finalName) {
          await this.cancelCreateFolder(node);
          return;
        }
      }

      console.log('[AssetTree] commitCreateFolder', {
        nodePath: node.path,
        finalName,
        isRename,
        existingEntry: existingEntry?.name,
        editingValue: this._editingValue,
        nodeName: node.name,
      });

      const newPath = this.joinPath(parentPath === '.' ? '' : parentPath, finalName);

      if (isRename) {
        // Rename existing item
        let finalFileName = finalName;

        if (node.kind === 'file') {
          // For rename operations, preserve the original extension unless user explicitly removed it
          // and they want to change it to a scene file
          if (this._originalExtension) {
            // User had an extension, check if they want to keep it or change it
            if (!finalName.includes('.')) {
              // User didn't specify extension, restore the original one
              finalFileName = finalName + this._originalExtension;
            } else {
              // User specified an extension, use what they provided
              finalFileName = finalName;
            }
          } else {
            // No original extension (unlikely for files, but handle it)
            finalFileName = finalName;
          }
        }

        const renamedPath = this.joinPath(parentPath === '.' ? '' : parentPath, finalFileName);
        await this.projectService.moveItem(node.path, renamedPath);
        node.path = renamedPath;
        node.name = finalFileName;
      } else {
        // Create new item
        if (node.kind === 'directory') {
          await this.projectService.createDirectory(newPath);
        } else if (node.kind === 'file') {
          // For new files, force the appropriate extension
          let filename = finalName;

          if (this._isNewScene) {
            // New scene creation - always force .pix3scene extension
            if (!filename.endsWith('.pix3scene')) {
              filename = `${filename}.pix3scene`;
            }
          } else if (this._originalExtension) {
            // New file with original extension preserved
            if (!filename.includes('.')) {
              filename = filename + this._originalExtension;
            }
          }
          // If no extension specified and no original extension, leave as-is

          const filePath = this.joinPath(parentPath === '.' ? '' : parentPath, filename);

          if (this._isNewScene) {
            // read template via ResourceManager and write
            const template = await this.resourceManager.readText('templ://startup-scene');
            await this.projectService.writeFile(filePath, template);
          }

          node.path = filePath;
          node.name = filename;
        }
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

      this.selectedPath = newPath.replace(/^\//, '');
      node.editing = false;
      this._editingValue = null;
      this._originalExtension = '';
      this._isNewScene = true;
      this.requestUpdate();
    } catch (err) {
      console.error('Failed to create/rename item', err);
      // remove temp node for create operations
      if (!isRename) {
        await this.cancelCreateFolder(node);
      }
    } finally {
      this._committing = false;
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

  private async deleteEntry(path: string): Promise<void> {
    try {
      console.log('[AssetTree] Deleting entry at path:', path);
      await this.projectService.deleteEntry(path);

      // Remove from tree UI
      const found = this.removeNodeByPath(path);
      if (!found) {
        console.warn('[AssetTree] Entry not found in tree:', path);
      }

      // Clear selection
      this.selectedPath = null;
      this.requestUpdate();

      console.log('[AssetTree] Entry deleted successfully:', path);
    } catch (error) {
      console.error('[AssetTree] Failed to delete entry:', error);
      throw error;
    }
  }

  // create-asset event no longer used here; menu directly starts creation flows
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-asset-tree': AssetTree;
  }
}
