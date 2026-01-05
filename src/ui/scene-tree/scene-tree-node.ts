import type { TemplateResult } from 'lit';
import { classMap } from 'lit/directives/class-map.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { repeat } from 'lit/directives/repeat.js';

import { ComponentBase, customElement, html, property, state, inject } from '@/fw';
import { appState } from '@/state';
import { CommandDispatcher } from '@/services';
import { IconService, IconSize } from '@/services/IconService';
import { ServiceContainer } from '@/fw/di';
import { SceneManager } from '@/core/SceneManager';
import { canDropNode } from '@/fw/hierarchy-validation';
import {
  selectObject,
  toggleObjectSelection,
  selectObjectRange,
} from '@/features/selection/SelectObjectCommand';
import { UpdateObjectPropertyCommand } from '@/features/properties/UpdateObjectPropertyCommand';
import type { ScriptComponent } from '@/core/ScriptComponent';

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
  properties: Record<string, unknown>;
  children: SceneTreeNode[];
  isContainer: boolean;
  hasController: boolean;
  hasBehaviors: boolean;
}

@customElement('pix3-scene-tree-node')
export class SceneTreeNodeComponent extends ComponentBase {
  static useShadowDom = false; // Use light DOM for proper nesting

  @inject(CommandDispatcher)
  private readonly commandDispatcher!: CommandDispatcher;

  @inject(IconService)
  private readonly iconService!: IconService;

  @inject(SceneManager)
  private readonly sceneManager!: SceneManager;
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

  @property({ type: String })
  draggedNodeId: string | null = null;

  @property({ type: String })
  draggedNodeType: string | null = null;

  @property({ type: Object })
  collapsedNodeIds: Set<string> = new Set();

  @state()
  private isCollapsed: boolean = false;

  @state()
  private dragOverPosition: 'top' | 'inside' | 'bottom' | null = null;

  @state()
  private isDragging: boolean = false;

  @state()
  private isVisible: boolean = true;

  @state()
  private isLocked: boolean = false;

  @state()
  private isValidDropTarget: boolean = true;

  updated(changedProperties: Map<string, any>): void {
    super.updated(changedProperties);
    if (changedProperties.has('node') || changedProperties.has('collapsedNodeIds')) {
      this.isCollapsed = this.collapsedNodeIds.has(this.node.id);
    }
    if (changedProperties.has('node')) {
      this.isVisible = (this.node.properties?.visible as boolean) ?? true;
      this.isLocked = (this.node.properties?.locked as boolean) ?? false;
    }
  }

  protected render() {
    const hasChildren = this.node.children.length > 0;
    const isSelected = this.selectedNodeIds.includes(this.node.id);
    const isPrimary = this.primaryNodeId === this.node.id;

    const contentClasses = classMap({
      'tree-node__content': true,
      'tree-node__content--selected': isSelected,
      'tree-node__content--primary': isPrimary,
      'tree-node__content--dragging': this.isDragging,
      'tree-node__content--drag-over-top': this.dragOverPosition === 'top' && !this.isDragging,
      'tree-node__content--drag-over-inside':
        this.dragOverPosition === 'inside' && !this.isDragging,
      'tree-node__content--drag-over-bottom':
        this.dragOverPosition === 'bottom' && !this.isDragging,
      'tree-node__content--drop-disabled':
        this.dragOverPosition !== null && !this.isValidDropTarget && !this.isDragging,
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
      <li
        class="tree-node"
        role="none"
        ?data-dragged=${this.draggedNodeId === this.node.id && this.draggedNodeId !== null}
      >
        <div
          class=${contentClasses}
          role="treeitem"
          aria-level=${this.level}
          aria-selected=${isSelected ? 'true' : 'false'}
          aria-expanded=${ifDefined(
            hasChildren ? (this.isCollapsed ? 'false' : 'true') : undefined
          )}
          tabindex=${this.focusable ? '0' : '-1'}
          data-node-id=${this.node.id}
          title=${this.getNodeTooltip(this.node)}
          @click=${(event: Event) => this.onSelectNode(event)}
          @keydown=${(event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
              this.onSelectNode(event);
              event.preventDefault();
            }
          }}
          @dragstart=${(event: DragEvent) => this.onDragStart(event)}
          @dragend=${(event: DragEvent) => this.onDragEnd(event)}
          @dragover=${(event: DragEvent) => this.onDragOver(event)}
          @dragleave=${(event: DragEvent) => this.onDragLeave(event)}
          @drop=${(event: DragEvent) => this.onDrop(event)}
          draggable="true"
        >
          ${expanderTemplate}
          <span
            class="tree-node__icon"
            title=${this.node.type}
            aria-label=${this.node.type}
            style="color: ${this.node.treeColor};"
          >
            ${this.renderNodeIcon(this.node.treeIcon)}
          </span>
          <span class="tree-node__label">
            <span class="tree-node__header">
              <span class="tree-node__name"> ${this.node.name} </span>
              ${this.node.hasController || this.node.hasBehaviors
                ? (() => {
                    const scene = this.sceneManager.getActiveSceneGraph();
                    const nodeObj = scene ? scene.nodeMap.get(this.node.id) : undefined;
                    const controllerName = nodeObj?.controller ? nodeObj.controller.type : null;
                    const behaviors = (nodeObj?.behaviors || []).map((b: ScriptComponent) => b.type);
                    return html`
                      <span
                        class="tree-node__script-indicator"
                        title=${controllerName
                          ? `Controller: ${controllerName}`
                          : 'Behaviors attached'}
                        tabindex="0"
                        aria-haspopup="true"
                      >
                        ${this.iconService.getIcon('zap', 12)}
                        <div class="script-popover" role="dialog" aria-label="Attached scripts">
                          <div class="script-popover__title">Attached scripts</div>
                          <ul class="script-popover__list">
                            ${controllerName
                              ? html`<li class="script-popover__item">
                                  <strong>Controller:</strong> ${controllerName}
                                </li>`
                              : null}
                            ${behaviors.length > 0
                              ? behaviors.map(
                                  (t: string) => html`<li class="script-popover__item">${t}</li>`
                                )
                              : null}
                            ${!controllerName && behaviors.length === 0
                              ? html`<li class="script-popover__empty">No scripts attached</li>`
                              : null}
                          </ul>
                        </div>
                      </span>
                    `;
                  })()
                : ''}
            </span>
            ${this.node.instancePath
              ? html`<span class="tree-node__instance">${this.node.instancePath}</span>`
              : null}
          </span>
          <div class="tree-node__buttons">
            <button
              type="button"
              class="tree-node__button tree-node__button--visible ${this.isVisible
                ? 'tree-node__button--active'
                : ''}"
              aria-label=${this.isVisible ? `Hide ${this.node.name}` : `Show ${this.node.name}`}
              @click=${(event: Event) => this.onToggleVisibility(event)}
            >
              ${this.renderToggleIcon(this.isVisible ? 'eye' : 'eye-off')}
            </button>
            <button
              type="button"
              class="tree-node__button tree-node__button--lock ${this.isLocked
                ? 'tree-node__button--active'
                : ''}"
              aria-label=${this.isLocked ? `Unlock ${this.node.name}` : `Lock ${this.node.name}`}
              @click=${(event: Event) => this.onToggleLock(event)}
            >
              ${this.renderToggleIcon(this.isLocked ? 'lock' : 'unlock')}
            </button>
          </div>
        </div>
        ${hasChildren && !this.isCollapsed
          ? html`<ul class="tree-children" role="group">
              ${repeat(
                this.node.children,
                child => child.id,
                (child, index) =>
                  html`<li>
                    <pix3-scene-tree-node
                      .node=${child}
                      .level=${this.level + 1}
                      .selectedNodeIds=${this.selectedNodeIds}
                      .primaryNodeId=${this.primaryNodeId}
                      .collapsedNodeIds=${this.collapsedNodeIds}
                      .draggedNodeId=${this.draggedNodeId}
                      .draggedNodeType=${this.draggedNodeType}
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
    return this.iconService.getIcon(iconName, IconSize.MEDIUM);
  }

  private renderToggleIcon(iconName: string): TemplateResult {
    return this.iconService.getIcon(iconName, IconSize.SMALL);
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

  private onDragStart(event: DragEvent): void {
    event.stopPropagation();
    this.isDragging = true;

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-scene-tree-node', this.node.id);
      const img = new Image();
      img.src =
        'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="16" height="16"%3E%3Crect width="16" height="16" fill="%235ec2ff" opacity="0.3"/%3E%3C/svg%3E';
      event.dataTransfer.setDragImage(img, 0, 0);
    }

    this.dispatchEvent(
      new CustomEvent('node-drag-start', {
        detail: {
          nodeId: this.node.id,
          nodeType: this.node.type,
        },
        bubbles: true,
        composed: true,
      })
    );
  }

  private onDragEnd(event: DragEvent): void {
    event.stopPropagation();
    this.isDragging = false;
    this.dragOverPosition = null;
    this.isValidDropTarget = true;

    this.dispatchEvent(
      new CustomEvent('node-drag-end', {
        detail: {},
        bubbles: true,
        composed: true,
      })
    );
  }

  private onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    const element = event.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();
    const relativeY = event.clientY - rect.top;
    const thresholdPercent = 0.33;

    let nextPosition: 'top' | 'inside' | 'bottom' | null = null;

    if (this.node.isContainer) {
      if (relativeY < rect.height * thresholdPercent) {
        nextPosition = 'top';
      } else if (relativeY > rect.height * (1 - thresholdPercent)) {
        nextPosition = 'bottom';
      } else {
        nextPosition = 'inside';
      }
    } else {
      nextPosition = relativeY < rect.height * 0.5 ? 'top' : 'bottom';
    }

    // Validate the drop target for the current hover position
    if (this.draggedNodeId && this.draggedNodeId !== this.node.id && !this.isDragging) {
      const isValid = this.validateDropTarget(this.draggedNodeId, this.node.id, nextPosition);
      // Set isValidDropTarget: true = valid/bright, false = invalid/faded
      this.isValidDropTarget = isValid;
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = isValid ? 'move' : 'none';
      }
    }

    if (this.dragOverPosition !== nextPosition) {
      this.dragOverPosition = nextPosition;
    }
  }

  private onDragLeave(event: DragEvent): void {
    event.stopPropagation();
    // Clear both position and validity when leaving - will restore fade via CSS
    this.dragOverPosition = null;
    this.isValidDropTarget = true;
  }

  private async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    const draggedNodeId = event.dataTransfer?.getData('application/x-scene-tree-node');

    const dropPosition = this.dragOverPosition;
    this.dragOverPosition = null;
    this.isValidDropTarget = true;

    if (!draggedNodeId) {
      return;
    }

    if (draggedNodeId === this.node.id) {
      return;
    }

    if (!this.isValidDropTarget) {
      console.log('[SceneTreeNode] Drop prevented: invalid target');
      return;
    }

    try {
      if (dropPosition === 'inside' || dropPosition === null) {
        if (this.node.isContainer) {
          await this.performReparent(draggedNodeId, this.node.id, -1);
        } else {
          await this.performReparent(draggedNodeId, this.node.id, 'after');
        }
      } else if (dropPosition === 'top') {
        await this.performReparent(draggedNodeId, this.node.id, 'before');
      } else if (dropPosition === 'bottom') {
        await this.performReparent(draggedNodeId, this.node.id, 'after');
      }
    } catch (error) {
      console.error('[SceneTreeNode] Failed to reparent node:', error);
    }
  }

  private async performReparent(
    draggedNodeId: string,
    targetNodeId: string,
    position: 'before' | 'after' | number
  ): Promise<void> {
    // This will be handled by the parent panel to access the scene graph
    this.dispatchEvent(
      new CustomEvent('node-drop', {
        detail: {
          draggedNodeId,
          targetNodeId,
          position,
        },
        bubbles: true,
        composed: true,
      })
    );
  }

  private async onToggleVisibility(event: Event): Promise<void> {
    event.stopPropagation();

    const newVisibleState = !this.isVisible;
    try {
      const command = new UpdateObjectPropertyCommand({
        nodeId: this.node.id,
        propertyPath: 'visible',
        value: newVisibleState,
      });

      await this.commandDispatcher.execute(command);
      this.isVisible = newVisibleState;
    } catch (error) {
      console.error('[SceneTreeNode] Failed to toggle visibility:', error);
    }
  }

  private async onToggleLock(event: Event): Promise<void> {
    event.stopPropagation();

    const newLockedState = !this.isLocked;
    try {
      const command = new UpdateObjectPropertyCommand({
        nodeId: this.node.id,
        propertyPath: 'locked',
        value: newLockedState,
      });

      await this.commandDispatcher.execute(command);
      this.isLocked = newLockedState;
    } catch (error) {
      console.error('[SceneTreeNode] Failed to toggle lock:', error);
    }
  }

  private validateDropTarget(
    draggedNodeId: string,
    targetNodeId: string,
    position: 'top' | 'inside' | 'bottom' | null
  ): boolean {
    if (!position) return true;

    const container = ServiceContainer.getInstance();
    const sceneManager = container.getService<SceneManager>(
      container.getOrCreateToken(SceneManager)
    );

    const activeSceneId = appState.scenes.activeSceneId;
    if (!activeSceneId) return true;

    const sceneGraph = sceneManager.getSceneGraph(activeSceneId);
    if (!sceneGraph) return true;

    const mappedPosition: 'inside' | 'before' | 'after' =
      position === 'inside' ? 'inside' : position === 'top' ? 'before' : 'after';

    return canDropNode(draggedNodeId, targetNodeId, sceneGraph, mappedPosition);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-scene-tree-node': SceneTreeNodeComponent;
  }
}
