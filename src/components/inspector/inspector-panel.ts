import { ComponentBase, css, customElement, html, state, subscribe, inject } from '../../fw';
import { SceneManager } from '../../core/scene';
import { appState } from '../../state';
import type { NodeBase } from '../../core/scene/nodes/NodeBase';
import { Node3D } from '../../core/scene/nodes/Node3D';
import { Sprite2D } from '../../core/scene/nodes/Sprite2D';

import '../ui/pix3-panel';

interface PropertyValue {
  value: string;
  isValid: boolean;
}

@customElement('pix3-inspector-panel')
export class InspectorPanel extends ComponentBase {
  @inject(SceneManager)
  private readonly sceneManager!: SceneManager;

  @state()
  private selectedNodes: NodeBase[] = [];

  @state()
  private primaryNode: NodeBase | null = null;

  @state()
  private nameValue = '';

  @state()
  private positionValues: Record<'x' | 'y' | 'z', PropertyValue> = {
    x: { value: '0', isValid: true },
    y: { value: '0', isValid: true },
    z: { value: '0', isValid: true },
  };

  @state()
  private rotationValues: Record<'x' | 'y' | 'z', PropertyValue> = {
    x: { value: '0', isValid: true },
    y: { value: '0', isValid: true },
    z: { value: '0', isValid: true },
  };

  @state()
  private scaleValues: Record<'x' | 'y' | 'z', PropertyValue> = {
    x: { value: '1', isValid: true },
    y: { value: '1', isValid: true },
    z: { value: '1', isValid: true },
  };

  @state()
  private visibleValue = true;

  private disposeSelectionSubscription?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.disposeSelectionSubscription = subscribe(appState.selection, () => {
      this.updateSelectedNodes();
    });
    this.updateSelectedNodes();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.disposeSelectionSubscription?.();
    this.disposeSelectionSubscription = undefined;
  }

  private updateSelectedNodes(): void {
    const { nodeIds, primaryNodeId } = appState.selection;
    const activeSceneId = appState.scenes.activeSceneId;

    if (!activeSceneId) {
      this.selectedNodes = [];
      this.primaryNode = null;
      return;
    }

    const sceneGraph = this.sceneManager.getSceneGraph(activeSceneId);
    if (!sceneGraph) {
      this.selectedNodes = [];
      this.primaryNode = null;
      return;
    }

    // Find selected nodes
    this.selectedNodes = nodeIds
      .map(nodeId => this.findNodeById(nodeId, sceneGraph.rootNodes))
      .filter((node): node is NodeBase => node !== null);

    // Find primary node
    this.primaryNode = primaryNodeId
      ? this.findNodeById(primaryNodeId, sceneGraph.rootNodes)
      : this.selectedNodes.length > 0
        ? this.selectedNodes[0]
        : null;

    this.syncValuesFromNode();
  }

  private findNodeById(nodeId: string, nodes: NodeBase[]): NodeBase | null {
    for (const node of nodes) {
      if (node.id === nodeId) {
        return node;
      }
      const found = this.findNodeById(nodeId, node.children);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private syncValuesFromNode(): void {
    if (!this.primaryNode) {
      this.resetValues();
      return;
    }

    const node = this.primaryNode;
    this.nameValue = node.name;

    // Handle visibility (assuming it's stored in properties)
    this.visibleValue = (node.properties.visible as boolean) ?? true;

    if (node instanceof Node3D) {
      // Position
      this.positionValues = {
        x: { value: this.formatNumber(node.position.x), isValid: true },
        y: { value: this.formatNumber(node.position.y), isValid: true },
        z: { value: this.formatNumber(node.position.z), isValid: true },
      };

      // Rotation (convert from radians to degrees)
      this.rotationValues = {
        x: { value: this.formatNumber(this.radToDeg(node.rotation.x)), isValid: true },
        y: { value: this.formatNumber(this.radToDeg(node.rotation.y)), isValid: true },
        z: { value: this.formatNumber(this.radToDeg(node.rotation.z)), isValid: true },
      };

      // Scale
      this.scaleValues = {
        x: { value: this.formatNumber(node.scale.x), isValid: true },
        y: { value: this.formatNumber(node.scale.y), isValid: true },
        z: { value: this.formatNumber(node.scale.z), isValid: true },
      };
    } else if (node instanceof Sprite2D) {
      // For 2D nodes, only show relevant transform properties
      this.positionValues = {
        x: { value: this.formatNumber(node.position.x), isValid: true },
        y: { value: this.formatNumber(node.position.y), isValid: true },
        z: { value: '0', isValid: true },
      };

      this.rotationValues = {
        x: { value: '0', isValid: true },
        y: { value: '0', isValid: true },
        z: { value: this.formatNumber(this.radToDeg(node.rotation)), isValid: true },
      };

      this.scaleValues = {
        x: { value: this.formatNumber(node.scale.x), isValid: true },
        y: { value: this.formatNumber(node.scale.y), isValid: true },
        z: { value: '1', isValid: true },
      };
    }
  }

  private resetValues(): void {
    this.nameValue = '';
    this.visibleValue = true;
    this.positionValues = {
      x: { value: '0', isValid: true },
      y: { value: '0', isValid: true },
      z: { value: '0', isValid: true },
    };
    this.rotationValues = {
      x: { value: '0', isValid: true },
      y: { value: '0', isValid: true },
      z: { value: '0', isValid: true },
    };
    this.scaleValues = {
      x: { value: '1', isValid: true },
      y: { value: '1', isValid: true },
      z: { value: '1', isValid: true },
    };
  }

  private formatNumber(value: number): string {
    return parseFloat(value.toFixed(4)).toString();
  }

  private radToDeg(rad: number): number {
    return rad * (180 / Math.PI);
  }

  private degToRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private handleNameInput(e: Event) {
    const input = e.target as HTMLInputElement;
    this.nameValue = input.value;

    if (this.primaryNode) {
      // TODO: Execute proper command to update node name
      this.primaryNode.name = input.value;
    }
  }

  private handleVisibilityChange(e: Event) {
    const checkbox = e.target as HTMLInputElement;
    this.visibleValue = checkbox.checked;

    if (this.primaryNode) {
      // TODO: Execute proper command to update node visibility
      this.primaryNode.properties.visible = checkbox.checked;
    }
  }

  private handleTransformInput(
    field: 'position' | 'rotation' | 'scale',
    axis: 'x' | 'y' | 'z',
    e: Event
  ) {
    const input = e.target as HTMLInputElement;
    const value = input.value;
    const num = parseFloat(value);
    const isValid = !isNaN(num);

    // Update local state
    if (field === 'position') {
      this.positionValues = { ...this.positionValues, [axis]: { value, isValid } };
    } else if (field === 'rotation') {
      this.rotationValues = { ...this.rotationValues, [axis]: { value, isValid } };
    } else if (field === 'scale') {
      this.scaleValues = { ...this.scaleValues, [axis]: { value, isValid } };
    }

    // Apply to node if valid
    if (isValid && this.primaryNode) {
      this.applyTransformToNode(field, axis, num);
    }
  }

  private handleTransformBlur(
    field: 'position' | 'rotation' | 'scale',
    axis: 'x' | 'y' | 'z',
    e: Event
  ) {
    const input = e.target as HTMLInputElement;
    let num = parseFloat(input.value);
    if (isNaN(num)) num = field === 'scale' ? 1 : 0;

    const formattedValue = this.formatNumber(num);

    // Update local state with formatted value
    if (field === 'position') {
      this.positionValues = {
        ...this.positionValues,
        [axis]: { value: formattedValue, isValid: true },
      };
    } else if (field === 'rotation') {
      this.rotationValues = {
        ...this.rotationValues,
        [axis]: { value: formattedValue, isValid: true },
      };
    } else if (field === 'scale') {
      this.scaleValues = { ...this.scaleValues, [axis]: { value: formattedValue, isValid: true } };
    }

    if (this.primaryNode) {
      this.applyTransformToNode(field, axis, num);
    }
  }

  private applyTransformToNode(
    field: 'position' | 'rotation' | 'scale',
    axis: 'x' | 'y' | 'z',
    value: number
  ) {
    if (!this.primaryNode) return;

    // TODO: Execute proper command to update node transform
    if (this.primaryNode instanceof Node3D) {
      if (field === 'position') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.primaryNode.position as any)[axis] = value;
      } else if (field === 'rotation') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.primaryNode.rotation as any)[axis] = this.degToRad(value);
      } else if (field === 'scale') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.primaryNode.scale as any)[axis] = value;
      }
    } else if (this.primaryNode instanceof Sprite2D) {
      if (field === 'position' && (axis === 'x' || axis === 'y')) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.primaryNode.position as any)[axis] = value;
      } else if (field === 'rotation' && axis === 'z') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.primaryNode as any).rotation = this.degToRad(value);
      } else if (field === 'scale' && (axis === 'x' || axis === 'y')) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.primaryNode.scale as any)[axis] = value;
      }
    }
  }

  protected render() {
    const hasSelection = this.selectedNodes.length > 0;

    return html`
      <pix3-panel
        panel-title="Inspector"
        panel-role="form"
        panel-description="Adjust properties for the currently selected node."
        actions-label="Inspector actions"
      >
        <div class="inspector-body">${hasSelection ? this.renderProperties() : ''}</div>
      </pix3-panel>
    `;
  }

  private renderProperties() {
    const nodeType = this.primaryNode?.type || 'Unknown';

    return html`
      <div class="property-section">
        <div class="section-header">
          <h3 class="section-title">Object Inspector</h3>
          ${this.selectedNodes.length > 1
            ? html`<p class="selection-info">${this.selectedNodes.length} objects selected</p>`
            : ''}
          <p class="node-type">${nodeType}</p>
        </div>

        <div class="property-group">
          <label class="property-label">
            Name:
            <input
              type="text"
              class="property-input property-input--text"
              .value=${this.nameValue}
              @input=${this.handleNameInput}
              placeholder="(unnamed)"
            />
          </label>
        </div>

        <div class="property-group">
          <label class="property-label property-label--checkbox">
            <input
              type="checkbox"
              class="property-checkbox"
              .checked=${this.visibleValue}
              @change=${this.handleVisibilityChange}
            />
            Visible
          </label>
        </div>

        ${this.renderTransformProperties()}
      </div>
    `;
  }

  private renderTransformProperties() {
    if (!(this.primaryNode instanceof Node3D) && !(this.primaryNode instanceof Sprite2D)) {
      return '';
    }

    return html`
      <div class="transform-section">
        <h4 class="subsection-title">Transform</h4>

        <div class="property-group">
          <span class="property-label">Position:</span>
          <div class="vector-input">
            ${this.renderVectorInputs('position', this.positionValues)}
          </div>
        </div>

        <div class="property-group">
          <span class="property-label">Rotation:</span>
          <div class="vector-input">
            ${this.renderVectorInputs('rotation', this.rotationValues)}
            <span class="unit-label">°</span>
          </div>
        </div>

        <div class="property-group">
          <span class="property-label">Scale:</span>
          <div class="vector-input">${this.renderVectorInputs('scale', this.scaleValues)}</div>
        </div>
      </div>
    `;
  }

  private renderVectorInputs(
    field: 'position' | 'rotation' | 'scale',
    values: Record<'x' | 'y' | 'z', PropertyValue>
  ) {
    return html`
      ${(['x', 'y', 'z'] as const).map(
        axis => html`
          <input
            type="number"
            step=${field === 'rotation' ? '0.1' : '0.01'}
            class="property-input property-input--number ${values[axis].isValid
              ? ''
              : 'property-input--invalid'}"
            .value=${values[axis].value}
            @input=${(e: Event) => this.handleTransformInput(field, axis, e)}
            @blur=${(e: Event) => this.handleTransformBlur(field, axis, e)}
          />
        `
      )}
    `;
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }

    pix3-panel {
      height: 100%;
    }

    .inspector-body {
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      font-family: var(--font-family-ui, 'Inter', sans-serif);
    }

    .property-section {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .section-header {
      border-bottom: 1px solid var(--color-border, #333);
      padding-bottom: 0.5rem;
    }

    .section-title {
      font-size: 0.95rem;
      font-weight: 600;
      margin: 0 0 0.25rem 0;
      color: var(--color-text-primary, #eee);
    }

    .selection-info {
      font-size: 0.75rem;
      color: var(--color-text-subtle, #aaa);
      margin: 0;
    }

    .node-type {
      font-size: 0.75rem;
      color: var(--color-text-secondary, #aaa);
      margin: 0.25rem 0 0 0;
    }

    .property-group {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .property-label {
      font-size: 0.8rem;
      color: var(--color-text-secondary, #aaa);
      min-width: 4.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .property-label--checkbox {
      min-width: auto;
    }

    .property-input {
      background: var(--color-input-bg, #222);
      color: var(--color-text-primary, #eee);
      border: 1px solid var(--color-border, #333);
      border-radius: 0.25rem;
      padding: 0.25rem 0.5rem;
      font-size: 0.8rem;
      box-sizing: border-box;
    }

    .property-input--text {
      flex: 1;
      min-width: 10rem;
    }

    .property-input--number {
      width: 4rem;
      margin-right: 0.25rem;
    }

    .property-input--invalid {
      border-color: var(--color-error, #f56565);
    }

    .property-input:focus {
      outline: none;
      border-color: var(--color-accent, #4e8df5);
    }

    .property-checkbox {
      margin: 0;
    }

    .transform-section {
      border-top: 1px solid var(--color-border-subtle, #2a2a2a);
      padding-top: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .subsection-title {
      font-size: 0.85rem;
      font-weight: 600;
      margin: 0 0 0.5rem 0;
      color: var(--color-text-primary, #eee);
    }

    .vector-input {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      flex: 1;
    }

    .unit-label {
      font-size: 0.7rem;
      color: var(--color-text-subtle, #888);
      margin-left: 0.25rem;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-inspector-panel': InspectorPanel;
  }
}
