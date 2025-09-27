import type { TemplateResult } from 'lit';
import { subscribe } from 'valtio/vanilla';
import { classMap } from 'lit/directives/class-map.js';
import { ifDefined } from 'lit/directives/if-defined.js';

import { ComponentBase, css, customElement, html, state } from '../../fw';
import { appState, type SceneDescriptor, type SceneHierarchyNode } from '../../state';
import { SelectObjectCommand } from '../../core/commands/SelectObjectCommand';

import '../ui/pix3-panel';

@customElement('pix3-scene-tree-panel')
export class SceneTreePanel extends ComponentBase {
  @state()
  private activeScene: SceneDescriptor | null = this.resolveActiveSceneDescriptor();

  @state()
  private activeSceneId: string | null = appState.scenes.activeSceneId;

  @state()
  private hierarchy: SceneHierarchyNode[] = this.cloneNodesForRender(
    this.resolveActiveHierarchyNodes()
  );

  @state()
  private selectedNodeIds: string[] = [...appState.selection.nodeIds];

  @state()
  private primaryNodeId: string | null = appState.selection.primaryNodeId;

  @state()
  private collapsedNodeIds: Set<string> = new Set();

  @state()
  private loadState = appState.scenes.loadState;

  @state()
  private loadError: string | null = appState.scenes.loadError;

  private disposeSceneSubscription?: () => void;
  private disposeSelectionSubscription?: () => void;

  connectedCallback(): void {
    super.connectedCallback();
    this.syncSceneState();
    this.syncSelectionState();
    this.disposeSceneSubscription = subscribe(appState.scenes, () => {
      this.syncSceneState();
    });
    this.disposeSelectionSubscription = subscribe(appState.selection, () => {
      this.syncSelectionState();
    });
  }

  disconnectedCallback(): void {
    this.disposeSceneSubscription?.();
    this.disposeSceneSubscription = undefined;
    this.disposeSelectionSubscription?.();
    this.disposeSelectionSubscription = undefined;
    super.disconnectedCallback();
  }

  protected render() {
    const hasHierarchy = this.hierarchy.length > 0;
    const activeSceneName = this.activeScene?.name ?? null;

    return html`
      <pix3-panel
        panel-title="Scene Tree"
        panel-description="Browse and organise the hierarchy of nodes in the active scene."
        actions-label="Scene tree controls"
      >
        ${activeSceneName ? html`<span slot="subtitle">${activeSceneName}</span>` : null}
        <div class="tree-container">
          ${hasHierarchy
            ? html`<ul
                class="tree-root"
                role="tree"
                aria-label=${this.getTreeAriaLabel(activeSceneName)}
              >
                ${this.hierarchy.map((node, index) => this.renderNode(node, 1, index === 0))}
              </ul>`
            : html`<p class="panel-placeholder">${this.getPlaceholderMessage()}</p>`}
        </div>
      </pix3-panel>
    `;
  }

  private syncSceneState(): void {
    const nextSceneId = appState.scenes.activeSceneId;
    const sceneChanged = this.activeSceneId !== nextSceneId;

    this.activeSceneId = nextSceneId;
    this.activeScene = this.resolveActiveSceneDescriptor();
    this.hierarchy = this.cloneNodesForRender(this.resolveActiveHierarchyNodes());
    this.loadState = appState.scenes.loadState;
    this.loadError = appState.scenes.loadError;

    if (sceneChanged) {
      this.collapsedNodeIds = new Set();
    } else if (this.collapsedNodeIds.size > 0) {
      const validIds = new Set<string>();
      this.collectNodeIds(this.hierarchy, validIds);
      const pruned = new Set([...this.collapsedNodeIds].filter(id => validIds.has(id)));
      if (pruned.size !== this.collapsedNodeIds.size) {
        this.collapsedNodeIds = pruned;
      }
    }
  }

  private syncSelectionState(): void {
    this.selectedNodeIds = [...appState.selection.nodeIds];
    this.primaryNodeId = appState.selection.primaryNodeId;
  }

  private resolveActiveSceneDescriptor(): SceneDescriptor | null {
    const sceneId = appState.scenes.activeSceneId;
    if (!sceneId) {
      return null;
    }
    return appState.scenes.descriptors[sceneId] ?? null;
  }

  private resolveActiveHierarchyNodes(): SceneHierarchyNode[] {
    const sceneId = appState.scenes.activeSceneId;
    if (!sceneId) {
      return [];
    }
    const hierarchy = appState.scenes.hierarchies[sceneId];
    if (!hierarchy) {
      return [];
    }
    return hierarchy.nodes ?? [];
  }

  private cloneNodesForRender(nodes: SceneHierarchyNode[]): SceneHierarchyNode[] {
    return nodes.map(node => ({
      ...node,
      children: this.cloneNodesForRender(node.children),
    }));
  }

  private collectNodeIds(nodes: SceneHierarchyNode[], target: Set<string>): void {
    for (const node of nodes) {
      target.add(node.id);
      if (node.children.length > 0) {
        this.collectNodeIds(node.children, target);
      }
    }
  }

  private renderNode(node: SceneHierarchyNode, level: number, focusable = false): TemplateResult {
    const hasChildren = node.children.length > 0;
    const isCollapsed = hasChildren && this.collapsedNodeIds.has(node.id);
    const isSelected = this.selectedNodeIds.includes(node.id);
    const isPrimary = this.primaryNodeId === node.id;

    const contentClasses = classMap({
      'tree-node__content': true,
      'tree-node__content--selected': isSelected,
      'tree-node__content--primary': isPrimary,
    });

    const expanderClasses = classMap({
      'tree-node__expander': true,
      'tree-node__expander--visible': hasChildren,
      'tree-node__expander--collapsed': hasChildren && isCollapsed,
      'tree-node__expander--button': hasChildren,
    });

    const expanderTemplate = hasChildren
      ? html`<button
          type="button"
          class=${expanderClasses}
          aria-label=${this.getToggleLabel(node.name, isCollapsed)}
          @click=${(event: Event) => this.onToggleNode(event, node.id)}
        ></button>`
      : html`<span class=${expanderClasses} aria-hidden="true"></span>`;

    return html`
      <li class="tree-node" role="none">
        <div
          class=${contentClasses}
          role="treeitem"
          aria-level=${level}
          aria-selected=${isSelected ? 'true' : 'false'}
          aria-expanded=${ifDefined(hasChildren ? (isCollapsed ? 'false' : 'true') : undefined)}
          tabindex=${focusable ? '0' : '-1'}
          data-node-id=${node.id}
          title=${this.getNodeTooltip(node)}
          @click=${(event: Event) => this.onSelectNode(event, node.id)}
        >
          ${expanderTemplate}
          <span class="tree-node__label">
            <span class="tree-node__header">
              <span class="tree-node__name">${node.name}</span>
              <span class="tree-node__type">${this.describeNodeType(node.type)}</span>
            </span>
            ${node.instancePath
              ? html`<span class="tree-node__instance">${node.instancePath}</span>`
              : null}
          </span>
        </div>
        ${hasChildren && !isCollapsed
          ? html`<ul class="tree-children" role="group">
              ${node.children.map(child => this.renderNode(child, level + 1))}
            </ul>`
          : null}
      </li>
    `;
  }

  private getTreeAriaLabel(activeSceneName: string | null): string {
    if (activeSceneName) {
      return `Scene nodes for ${activeSceneName}`;
    }
    return 'Scene nodes';
  }

  private getPlaceholderMessage(): string {
    if (this.loadState === 'loading') {
      return 'Loading scene…';
    }
    if (this.loadState === 'error') {
      return this.loadError ?? 'Failed to load scene.';
    }
    if (this.activeSceneId && !this.hierarchy.length) {
      return 'The active scene has no nodes yet.';
    }
    return 'Scene hierarchy will appear here once a project is loaded.';
  }

  private describeNodeType(type: string): string {
    switch (type) {
      case 'Node3D':
        return '3D';
      case 'Sprite2D':
        return '2D Sprite';
      case 'Group':
        return 'Group';
      case 'Instance':
        return 'Instance';
      default:
        return type;
    }
  }

  private getNodeTooltip(node: SceneHierarchyNode): string {
    const typeLabel = this.describeNodeType(node.type);
    if (node.instancePath) {
      return `${node.name} · ${typeLabel} · ${node.instancePath}`;
    }
    return `${node.name} · ${typeLabel}`;
  }

  private getToggleLabel(nodeName: string, isCollapsed: boolean): string {
    return isCollapsed ? `Expand ${nodeName}` : `Collapse ${nodeName}`;
  }

  private onToggleNode(event: Event, nodeId: string): void {
    event.stopPropagation();
    const next = new Set(this.collapsedNodeIds);
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }
    this.collapsedNodeIds = next;
  }

  private onSelectNode(event: Event, nodeId: string): void {
    event.stopPropagation();

    // Determine selection behavior based on modifier keys
    const mouseEvent = event as MouseEvent;
    const isAdditive = mouseEvent.ctrlKey || mouseEvent.metaKey;
    const isRange = mouseEvent.shiftKey;

    // Execute selection command
    const command = new SelectObjectCommand({
      nodeId,
      additive: isAdditive,
      range: isRange,
    });

    // TODO: Execute command through proper command dispatcher
    // For now, execute directly (this should be replaced with proper command system)
    try {
      const context = {
        state: appState,
        snapshot: appState, // This is not correct, should be proper snapshot
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        container: null as any,
        requestedAt: Date.now(),
      };
      const result = command.execute(context);
      if (result.didMutate) {
        // Selection state will be automatically updated via subscription
        console.log(`Selected node: ${nodeId}`, {
          additive: isAdditive,
          range: isRange,
          selectedCount: appState.selection.nodeIds.length,
        });
      }
    } catch (error) {
      console.error('[SceneTreePanel] Failed to execute selection command', error);
    }
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }

    pix3-panel {
      height: 100%;
    }

    .tree-container {
      display: flex;
      flex-direction: column;
      min-height: 100%;
      font-size: 0.88rem;
      color: rgba(245, 247, 250, 0.88);
    }

    .tree-root,
    .tree-children {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .tree-root {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .tree-children {
      margin-top: 0.15rem;
      margin-bottom: 0.3rem;
      padding-inline-start: 1.4rem;
      border-inline-start: 1px solid rgba(255, 255, 255, 0.06);
    }

    .tree-node {
      margin: 0;
    }

    .tree-node__content {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 0.55rem;
      padding: 0.35rem 0.5rem;
      border-radius: 0.45rem;
      background: rgba(38, 42, 50, 0.35);
      border: 1px solid rgba(255, 255, 255, 0.04);
      transition:
        background 120ms ease,
        border-color 120ms ease;
    }

    .tree-node__content:hover {
      background: rgba(56, 62, 74, 0.55);
    }

    .tree-node__content:focus-visible {
      outline: 2px solid rgba(94, 194, 255, 0.8);
      outline-offset: 2px;
    }

    .tree-node__content--selected {
      background: rgba(48, 113, 255, 0.25);
      border-color: rgba(90, 162, 255, 0.5);
    }

    .tree-node__content--primary {
      box-shadow: 0 0 0 1px rgba(90, 162, 255, 0.45);
    }

    .tree-node__expander {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.2rem;
      min-width: 1.2rem;
      height: 1.2rem;
      padding: 0;
      border: none;
      background: transparent;
      color: rgba(245, 247, 250, 0.45);
      font-size: 0.75rem;
      line-height: 1;
      font: inherit;
    }

    .tree-node__expander--button {
      cursor: pointer;
    }

    .tree-node__expander--button:hover {
      color: rgba(245, 247, 250, 0.7);
    }

    .tree-node__expander--button:focus-visible {
      outline: 2px solid rgba(94, 194, 255, 0.8);
      border-radius: 0.35rem;
    }

    .tree-node__expander::before {
      content: '';
    }

    .tree-node__expander--visible::before {
      content: '▾';
    }

    .tree-node__expander--collapsed::before {
      content: '▸';
    }

    .tree-node__label {
      display: inline-flex;
      flex-direction: column;
      gap: 0.18rem;
      align-items: flex-start;
    }

    .tree-node__header {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.45rem;
    }

    .tree-node__name {
      font-weight: 500;
      letter-spacing: 0.01em;
    }

    .tree-node__type {
      display: inline-block;
      padding: 0.1rem 0.35rem;
      border-radius: 999px;
      font-size: 0.64rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      background: rgba(74, 88, 112, 0.55);
      color: rgba(236, 240, 248, 0.82);
      align-self: flex-start;
    }

    .tree-node__instance {
      font-size: 0.7rem;
      color: rgba(236, 239, 243, 0.6);
    }

    .panel-placeholder {
      margin: 0;
      color: rgba(245, 247, 250, 0.58);
      font-style: italic;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-scene-tree-panel': SceneTreePanel;
  }
}
