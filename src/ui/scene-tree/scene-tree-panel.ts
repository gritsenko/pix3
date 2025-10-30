import { subscribe } from 'valtio/vanilla';

import { ComponentBase, customElement, html, state } from '@/fw';
import { appState, type SceneDescriptor } from '@/state';
import { NodeBase } from '@/nodes/NodeBase';
import { getNodeVisuals } from './node-visuals.helper';
import type { SceneTreeNode } from './scene-tree-node';

import '../shared/pix3-panel';
import '../shared/pix3-toolbar';
import '../shared/pix3-dropdown-button';
import './scene-tree-node';
import './scene-tree-panel.ts.css';

@customElement('pix3-scene-tree-panel')
export class SceneTreePanel extends ComponentBase {
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
        panel-description="Browse and organise the hierarchy of nodes in the active scene."
        actions-label="Scene tree controls"
      >
        ${activeSceneName ? html`<span slot="subtitle">${activeSceneName}</span>` : null}
        <pix3-toolbar slot="toolbar" label="Scene tree controls">
          <pix3-dropdown-button
            icon="+"
            aria-label="Create node"
            .items=${[
              { id: 'box', label: 'Box', icon: '📦' },
              { id: 'sphere', label: 'Sphere', icon: '⚪' },
              { id: 'camera', label: 'Camera', icon: '📷' },
              { id: 'light', label: 'Light', icon: '💡' },
            ]}
            @item-select=${this.onCreateNode}
          ></pix3-dropdown-button>
        </pix3-toolbar>
        <div class="tree-container" @toggle-node=${this.onToggleNode.bind(this)}>
          ${hasHierarchy
            ? html`<ul
                class="tree-root"
                role="tree"
                aria-label=${this.getTreeAriaLabel(activeSceneName)}
              >
                ${this.hierarchy.map(
                  (node, index) =>
                    html`<pix3-scene-tree-node
                      .node=${node}
                      .level=${1}
                      .selectedNodeIds=${this.selectedNodeIds}
                      .primaryNodeId=${this.primaryNodeId}
                      .collapsedNodeIds=${this.collapsedNodeIds}
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
    const nextDescriptor = this.resolveActiveSceneDescriptor();
    const nextHierarchyRoots = this.resolveActiveHierarchyNodes();

    // Only rebuild tree if scene changed, load state changed, or hierarchy changed
    const needsRebuild =
      sceneChanged ||
      this.loadState !== nextLoadState ||
      this.loadError !== nextLoadError ||
      nextHierarchyRoots !== this.resolveActiveHierarchyNodes();

    this.activeSceneId = nextSceneId;
    this.activeScene = nextDescriptor;
    this.loadState = nextLoadState;
    this.loadError = nextLoadError;

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

  private onCreateNode(event: CustomEvent): void {
    const { id } = event.detail;
    // Placeholder for creating a node based on the selected type
    console.log(`Create ${id} node`);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-scene-tree-panel': SceneTreePanel;
  }
}
