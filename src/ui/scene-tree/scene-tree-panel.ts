import type { TemplateResult } from 'lit';
import { subscribe } from 'valtio/vanilla';
import { classMap } from 'lit/directives/class-map.js';
import { ifDefined } from 'lit/directives/if-defined.js';

import { ComponentBase, customElement, html, state, inject } from '@/fw';
import { appState, type SceneDescriptor } from '@/state';
import { SelectObjectOperation } from '@/core/operations/SelectObjectOperation';
import { OperationService } from '@/core/operations/OperationService';
import type { NodeBase } from '@/core/scene/nodes/NodeBase';

import '../shared/pix3-panel';
import './scene-tree-panel.ts.css';

/**
 * View model for scene tree nodes - UI-specific representation.
 */
interface SceneTreeNode {
  id: string;
  name: string;
  type: string;
  treeColor: string;
  instancePath: string | null;
  children: SceneTreeNode[];
}

@customElement('pix3-scene-tree-panel')
export class SceneTreePanel extends ComponentBase {
  @inject(OperationService)
  private readonly operationService!: OperationService;
  @state()
  private activeScene: SceneDescriptor | null = this.resolveActiveSceneDescriptor();

  @state()
  private activeSceneId: string | null = appState.scenes.activeSceneId;

  @state()
  private hierarchy: SceneTreeNode[] = this.buildTreeNodes(
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
    this.hierarchy = this.buildTreeNodes(this.resolveActiveHierarchyNodes());
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

  private resolveActiveHierarchyNodes(): NodeBase[] {
    const sceneId = appState.scenes.activeSceneId;
    if (!sceneId) {
      return [];
    }
    const hierarchy = appState.scenes.hierarchies[sceneId];
    if (!hierarchy) {
      return [];
    }
    return (hierarchy.rootNodes ?? []) as NodeBase[];
  }

  /**
   * Converts NodeBase instances to SceneTreeNode view models.
   */
  private buildTreeNodes(nodes: NodeBase[]): SceneTreeNode[] {
    return nodes.map(node => ({
      id: node.nodeId,
      name: node.name,
      type: node.type,
      treeColor: node.treeColor,
      instancePath: node.instancePath,
      children: this.buildTreeNodes(node.children),
    }));
  }

  private collectNodeIds(nodes: SceneTreeNode[], target: Set<string>): void {
    for (const node of nodes) {
      target.add(node.id);
      if (node.children.length > 0) {
        this.collectNodeIds(node.children, target);
      }
    }
  }

  private renderNode(node: SceneTreeNode, level: number, focusable = false): TemplateResult {
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
              <span class="tree-node__name" style="color: ${node.treeColor};">${node.name}</span>
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



  private getNodeTooltip(node: SceneTreeNode): string {
    if (node.instancePath) {
      return `${node.name} · ${node.type} · ${node.instancePath}`;
    }
    return `${node.name} · ${node.type}`;
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

  private async onSelectNode(event: Event, nodeId: string): Promise<void> {
    event.stopPropagation();

    // Determine selection behavior based on modifier keys
    const mouseEvent = event as MouseEvent;
    const isAdditive = mouseEvent.ctrlKey || mouseEvent.metaKey;
    const isRange = mouseEvent.shiftKey;

    // Execute selection command via dispatcher
    const op = new SelectObjectOperation({
      nodeId,
      additive: isAdditive,
      range: isRange,
    });

    try {
  await this.operationService.invokeAndPush(op);
      // Selection state will be automatically updated via subscription
      console.log(`Selected node: ${nodeId}`, {
        additive: isAdditive,
        range: isRange,
        selectedCount: appState.selection.nodeIds.length,
      });
    } catch (error) {
      console.error('[SceneTreePanel] Failed to execute selection command', error);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-scene-tree-panel': SceneTreePanel;
  }
}
