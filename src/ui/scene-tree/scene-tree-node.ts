import type { TemplateResult } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import feather from 'feather-icons';

import { ComponentBase, customElement, html, property, state, inject } from '@/fw';
import { appState } from '@/state';
import { CommandDispatcher } from '@/services';
import {
  selectObject,
  toggleObjectSelection,
  selectObjectRange,
} from '@/features/selection/SelectObjectCommand';

import './scene-tree-node.ts.css';

/**
 * View model for scene tree nodes - UI-specific representation.
 */
export interface SceneTreeNode {
  id: string;
  name: string;
  type: string;
  treeColor: string;
  treeIcon: string;
  instancePath: string | null;
  children: SceneTreeNode[];
}

@customElement('pix3-scene-tree-node')
export class SceneTreeNodeComponent extends ComponentBase {
  static useShadowDom = false; // Use light DOM for proper nesting

  @inject(CommandDispatcher)
  private readonly commandDispatcher!: CommandDispatcher;

  @property({ type: Object })
  node!: SceneTreeNode;

  @property({ type: Number })
  level: number = 1;

  @property({ type: Boolean })
  focusable: boolean = false;

  @property({ type: Array })
  selectedNodeIds: string[] = [];

  @property({ type: String })
  primaryNodeId: string | null = null;

  @property({ type: Object })
  collapsedNodeIds: Set<string> = new Set();

  @state()
  private isCollapsed: boolean = false;

  updated(): void {
    this.isCollapsed = this.collapsedNodeIds.has(this.node.id);
  }

  protected render() {
    const hasChildren = this.node.children.length > 0;
    const isSelected = this.selectedNodeIds.includes(this.node.id);
    const isPrimary = this.primaryNodeId === this.node.id;

    const contentClasses = classMap({
      'tree-node__content': true,
      'tree-node__content--selected': isSelected,
      'tree-node__content--primary': isPrimary,
    });

    const expanderClasses = classMap({
      'tree-node__expander': true,
      'tree-node__expander--visible': hasChildren,
      'tree-node__expander--collapsed': hasChildren && this.isCollapsed,
      'tree-node__expander--button': hasChildren,
    });

    const expanderTemplate = hasChildren
      ? html`<button
          type="button"
          class=${expanderClasses}
          aria-label=${this.getToggleLabel(this.node.name, this.isCollapsed)}
          @click=${(event: Event) => this.onToggleNode(event)}
        ></button>`
      : html`<span class=${expanderClasses} aria-hidden="true"></span>`;

    return html`
      <li class="tree-node" role="none">
        <div
          class=${contentClasses}
          role="treeitem"
          aria-level=${this.level}
          aria-selected=${isSelected ? 'true' : 'false'}
          aria-expanded=${ifDefined(hasChildren ? (this.isCollapsed ? 'false' : 'true') : undefined)}
          tabindex=${this.focusable ? '0' : '-1'}
          data-node-id=${this.node.id}
          title=${this.getNodeTooltip(this.node)}
          @click=${(event: Event) => this.onSelectNode(event)}
        >
          ${expanderTemplate}
          <span class="tree-node__icon" title=${this.node.type} aria-label=${this.node.type}>
            ${this.renderNodeIcon(this.node.treeIcon)}
          </span>
          <span class="tree-node__label">
            <span class="tree-node__header">
              <span class="tree-node__name" style="color: ${this.node.treeColor};">
                ${this.node.name}
              </span>
            </span>
            ${this.node.instancePath
              ? html`<span class="tree-node__instance">${this.node.instancePath}</span>`
              : null}
          </span>
        </div>
        ${hasChildren && !this.isCollapsed
          ? html`<ul class="tree-children" role="group">
              ${this.node.children.map(
                (child, index) =>
                  html`<li>
                    <pix3-scene-tree-node
                      .node=${child}
                      .level=${this.level + 1}
                      .selectedNodeIds=${this.selectedNodeIds}
                      .primaryNodeId=${this.primaryNodeId}
                      .collapsedNodeIds=${this.collapsedNodeIds}
                      ?focusable=${index === 0}
                    ></pix3-scene-tree-node>
                  </li>`
              )}
            </ul>`
          : null}
      </li>
    `;
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

  private renderNodeIcon(iconName: string): TemplateResult {
    const icon = feather.icons[iconName as keyof typeof feather.icons];
    if (!icon) {
      console.warn(`[SceneTreeNode] Icon not found: ${iconName}`);
      return html`${unsafeSVG(feather.icons['box'].toSvg({ width: 16, height: 16 }))}`;
    }
    return html`${unsafeSVG(icon.toSvg({ width: 16, height: 16 }))}`;
  }

  private onToggleNode(event: Event): void {
    event.stopPropagation();
    this.isCollapsed = !this.isCollapsed;
    this.dispatchEvent(
      new CustomEvent('toggle-node', {
        detail: { nodeId: this.node.id, isCollapsed: this.isCollapsed },
        bubbles: true,
        composed: true,
      })
    );
  }

  private async onSelectNode(event: Event): Promise<void> {
    event.stopPropagation();

    // Determine selection behavior based on modifier keys
    const mouseEvent = event as MouseEvent;
    const isAdditive = mouseEvent.ctrlKey || mouseEvent.metaKey;
    const isRange = mouseEvent.shiftKey;

    // Execute selection command via dispatcher
    const command = isRange
      ? selectObjectRange(this.node.id)
      : isAdditive
        ? toggleObjectSelection(this.node.id)
        : selectObject(this.node.id);

    try {
      const didMutate = await this.commandDispatcher.execute(command);
      // Selection state will be automatically updated via subscription
      if (didMutate) {
        console.log(`Selected node: ${this.node.id}`, {
          additive: isAdditive,
          range: isRange,
          selectedCount: appState.selection.nodeIds.length,
        });
      }
    } catch (error) {
      console.error('[SceneTreeNode] Failed to execute selection command', error);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-scene-tree-node': SceneTreeNodeComponent;
  }
}
