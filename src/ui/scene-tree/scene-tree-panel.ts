import { subscribe } from 'valtio/vanilla';
import { repeat } from 'lit/directives/repeat.js';

import { ComponentBase, customElement, html, state, inject } from '@/fw';
import { appState, type SceneDescriptor } from '@/state';
import { NodeBase } from '@pix3/runtime';
import { getNodeVisuals } from './node-visuals.helper';
import type { SceneTreeNode } from './scene-tree-node';
import { CommandDispatcher } from '@/services/CommandDispatcher';
import { NodeRegistry } from '@/services/NodeRegistry';
import { ReparentNodeCommand } from '@/features/scene/ReparentNodeCommand';
import { SceneManager } from '@pix3/runtime';
import { ServiceContainer } from '@/fw/di';

import '../shared/pix3-panel';
import '../shared/pix3-toolbar';
import '../shared/pix3-dropdown-button';
import './scene-tree-node';
import './scene-tree-panel.ts.css';

@customElement('pix3-scene-tree-panel')
export class SceneTreePanel extends ComponentBase {
  @inject(CommandDispatcher)
  private readonly commandDispatcher!: CommandDispatcher;

  @inject(NodeRegistry)
  private readonly nodeRegistry!: NodeRegistry;

  @state()
  private activeScene: SceneDescriptor | null = this.resolveActiveSceneDescriptor();

  @state()
  private activeSceneId: string | null = appState.scenes.activeSceneId;

  @state()
  private hierarchy: SceneTreeNode[] = this.buildTreeNodes(this.resolveActiveHierarchyNodes());

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

  @state()
  private draggedNodeId: string | null = null;

  @state()
  private draggedNodeType: string | null = null;

  @state()
  private lastLoadedAt = appState.scenes.lastLoadedAt;

  @state()
  private lastNodeDataChangeSignal = appState.scenes.nodeDataChangeSignal;

  @state()
  private createNodeItems: Array<{
    label: string;
    items: Array<{ id: string; label: string; icon: string; color: string }>;
  }> = [];

  private lastHierarchyRef: NodeBase[] | null = null;
  private disposeSceneSubscription?: () => void;
  private disposeSelectionSubscription?: () => void;

  connectedCallback(): void {
    super.connectedCallback();
    this.syncSceneState();
    this.syncSelectionState();
    this.syncCreateNodeItems();
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
        panel-description="Browse and organise the hierarchy of nodes in the active scene."
        actions-label="Scene tree controls"
      >
        ${activeSceneName ? html`<span slot="subtitle">${activeSceneName}</span>` : null}
        <pix3-toolbar slot="toolbar" label="Scene tree controls">
          <pix3-dropdown-button
            icon="plus-circle"
            aria-label="Create node"
            .groupedItems=${this.createNodeItems}
            @item-select=${this.onCreateNode}
          ></pix3-dropdown-button>
        </pix3-toolbar>
        <div
          class="tree-container"
          ?data-dragging=${this.draggedNodeId !== null}
          @toggle-node=${this.onToggleNode.bind(this)}
          @node-drop=${this.onNodeDrop.bind(this)}
          @node-drag-start=${this.onNodeDragStart.bind(this)}
          @node-drag-end=${this.onNodeDragEnd.bind(this)}
        >
          ${hasHierarchy
            ? html`<ul
                class="tree-root"
                role="tree"
                aria-label=${this.getTreeAriaLabel(activeSceneName)}
              >
                ${repeat(
                  this.hierarchy,
                  node => node.id,
                  (node, index) =>
                    html`<pix3-scene-tree-node
                      .node=${node}
                      .level=${1}
                      .selectedNodeIds=${this.selectedNodeIds}
                      .primaryNodeId=${this.primaryNodeId}
                      .collapsedNodeIds=${this.collapsedNodeIds}
                      .draggedNodeId=${this.draggedNodeId}
                      .draggedNodeType=${this.draggedNodeType}
                      ?focusable=${index === 0}
                    ></pix3-scene-tree-node>`
                )}
              </ul>`
            : html`<p class="panel-placeholder">${this.getPlaceholderMessage()}</p>`}
        </div>
      </pix3-panel>
    `;
  }

  private syncSceneState(): void {
    const nextSceneId = appState.scenes.activeSceneId;
    const sceneChanged = this.activeSceneId !== nextSceneId;
    const nextLoadState = appState.scenes.loadState;
    const nextLoadError = appState.scenes.loadError;
    const nextLastLoadedAt = appState.scenes.lastLoadedAt;
    const nextNodeDataChangeSignal = appState.scenes.nodeDataChangeSignal;
    const nextDescriptor = this.resolveActiveSceneDescriptor();
    const nextHierarchyRoots = this.resolveActiveHierarchyNodes();

    // Detect if hierarchy reference changed (new array was assigned)
    const hierarchyChanged = this.lastHierarchyRef !== nextHierarchyRoots;

    // Only rebuild tree if scene changed, load state changed, hierarchy changed, scene was marked dirty/reloaded, or node data changed
    const needsRebuild =
      sceneChanged ||
      this.loadState !== nextLoadState ||
      this.loadError !== nextLoadError ||
      this.lastLoadedAt !== nextLastLoadedAt ||
      this.lastNodeDataChangeSignal !== nextNodeDataChangeSignal ||
      hierarchyChanged;

    this.activeSceneId = nextSceneId;
    this.activeScene = nextDescriptor;
    this.loadState = nextLoadState;
    this.loadError = nextLoadError;
    this.lastLoadedAt = nextLastLoadedAt;
    this.lastNodeDataChangeSignal = nextNodeDataChangeSignal;
    this.lastHierarchyRef = nextHierarchyRoots;

    if (needsRebuild) {
      this.hierarchy = this.buildTreeNodes(nextHierarchyRoots);
    }

    if (sceneChanged) {
      this.collapsedNodeIds = new Set();
    } else if (this.collapsedNodeIds.size > 0 && needsRebuild) {
      const validIds = new Set<string>();
      this.collectNodeIds(this.hierarchy, validIds);
      const pruned = new Set([...this.collapsedNodeIds].filter(id => validIds.has(id)));
      if (pruned.size !== this.collapsedNodeIds.size) {
        this.collapsedNodeIds = pruned;
      }
    }
  }

  private syncCreateNodeItems(): void {
    this.createNodeItems = this.nodeRegistry.getGroupedDropdownItems();
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
    return nodes.map(node => {
      const { color, icon } = getNodeVisuals(node);
      return {
        id: node.nodeId,
        name: node.name,
        type: node.type,
        treeColor: color,
        treeIcon: icon,
        instancePath: node.instancePath,
        properties: node.properties,
        isContainer: node.isContainer,
        scripts: node.components.map(c => c.type),
        // Only include NodeBase children, filter out Three.js objects like Mesh, Light, etc.
        children: this.buildTreeNodes(node.children.filter(child => child instanceof NodeBase)),
      };
    });
  }

  private collectNodeIds(nodes: SceneTreeNode[], target: Set<string>): void {
    for (const node of nodes) {
      target.add(node.id);
      if (node.children.length > 0) {
        this.collectNodeIds(node.children, target);
      }
    }
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

  private onToggleNode(event: CustomEvent): void {
    const { nodeId, isCollapsed } = event.detail;
    const next = new Set(this.collapsedNodeIds);
    if (isCollapsed) {
      next.add(nodeId);
    } else {
      next.delete(nodeId);
    }
    this.collapsedNodeIds = next;
  }

  private async onCreateNode(event: CustomEvent): Promise<void> {
    const { id } = event.detail;
    const command = this.nodeRegistry.createCommand(id);
    if (!command) {
      console.error('[SceneTreePanel] Unknown node type:', id);
      return;
    }

    try {
      await this.commandDispatcher.execute(command);
    } catch (error) {
      console.error('[SceneTreePanel] Failed to create node:', error);
    }
  }

  private async onNodeDrop(event: CustomEvent): Promise<void> {
    const { draggedNodeId, targetNodeId, position } = event.detail;

    console.log('[SceneTreePanel] onNodeDrop:', { draggedNodeId, targetNodeId, position });

    // Get scene information
    const sceneId = appState.scenes.activeSceneId;
    if (!sceneId) {
      console.log('[SceneTreePanel] No active scene');
      return;
    }

    const container = ServiceContainer.getInstance();
    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );

    const sceneGraph = sceneManager.getSceneGraph(sceneId);
    if (!sceneGraph) {
      console.log('[SceneTreePanel] No scene graph');
      return;
    }

    // Find the target node
    const targetNode = sceneGraph.nodeMap.get(targetNodeId);
    if (!targetNode) {
      console.log('[SceneTreePanel] Target node not found:', targetNodeId);
      return;
    }

    let newParentId: string | null = null;
    let newIndex: number = -1;

    if (position === 'before' || position === 'after') {
      // Drop before/after: use target's parent as new parent
      if (targetNode.parentNode) {
        newParentId = targetNode.parentNode.nodeId;
        const targetIndex = targetNode.parentNode.children.indexOf(targetNode);
        newIndex = position === 'before' ? targetIndex : targetIndex + 1;
      } else {
        // Target is at root level
        const targetIndex = sceneGraph.rootNodes.indexOf(targetNode);
        newIndex = position === 'before' ? targetIndex : targetIndex + 1;
      }
    } else {
      // Drop inside: use target as parent
      newParentId = targetNodeId;
      newIndex = -1; // Append
    }

    console.log('[SceneTreePanel] Executing reparent:', {
      draggedNodeId,
      newParentId,
      newIndex,
      position,
    });

    try {
      const command = new ReparentNodeCommand({
        nodeId: draggedNodeId,
        newParentId,
        newIndex,
      });

      await this.commandDispatcher.execute(command);
    } catch (error) {
      console.error('[SceneTreePanel] Failed to reparent node:', error);
    }
  }

  private onNodeDragStart(event: CustomEvent): void {
    const { nodeId, nodeType } = event.detail;
    this.draggedNodeId = nodeId;
    this.draggedNodeType = nodeType;
    console.log('[SceneTreePanel] Drag started:', { nodeId, nodeType });
  }

  private onNodeDragEnd(_event: CustomEvent): void {
    this.draggedNodeId = null;
    this.draggedNodeType = null;
    console.log('[SceneTreePanel] Drag ended');
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-scene-tree-panel': SceneTreePanel;
  }
}
