import { ComponentBase, customElement, html, state, subscribe, inject } from '@/fw';
import { SceneManager } from '@/core/SceneManager';
import { appState } from '@/state';
import type { NodeBase } from '@/nodes/NodeBase';
import { Node3D } from '@/nodes/Node3D';
import { Sprite2D } from '@/nodes/2D/Sprite2D';
import { Group2D } from '@/nodes/2D/Group2D';
import { UpdateObjectPropertyOperation } from '@/features/properties/UpdateObjectPropertyOperation';
import { UpdateGroup2DSizeCommand } from '@/features/scene/UpdateGroup2DSizeCommand';
import { OperationService } from '@/services/OperationService';
import { CommandDispatcher } from '@/services/CommandDispatcher';

import '../shared/pix3-panel';
import './inspector-panel.ts.css';

interface PropertyValue {
  value: string;
  isValid: boolean;
}

@customElement('pix3-inspector-panel')
export class InspectorPanel extends ComponentBase {
  @inject(SceneManager)
  private readonly sceneManager!: SceneManager;

  @inject(OperationService)
  private readonly operationService!: OperationService;

  @inject(CommandDispatcher)
  private readonly commandDispatcher!: CommandDispatcher;

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

  @state()
  private sizeValues: Record<'width' | 'height', PropertyValue> = {
    width: { value: '100', isValid: true },
    height: { value: '100', isValid: true },
  };

  private disposeSelectionSubscription?: () => void;
  private disposeSceneSubscription?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.disposeSelectionSubscription = subscribe(appState.selection, () => {
      this.updateSelectedNodes();
    });
    this.disposeSceneSubscription = subscribe(appState.scenes, () => {
      this.updateSelectedNodes();
    });
    this.updateSelectedNodes();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.disposeSelectionSubscription?.();
    this.disposeSelectionSubscription = undefined;
    this.disposeSceneSubscription?.();
    this.disposeSceneSubscription = undefined;
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
      if (node.nodeId === nodeId) {
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

    // Handle visibility (prefer live Object3D state)
    this.visibleValue =
      typeof node.properties.visible === 'boolean'
        ? (node.properties.visible as boolean)
        : node.visible;

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
    } else if (node instanceof Group2D) {
      // For Group2D, show size properties
      this.sizeValues = {
        width: { value: this.formatNumber(node.width), isValid: true },
        height: { value: this.formatNumber(node.height), isValid: true },
      };

      // Position (2D)
      this.positionValues = {
        x: { value: this.formatNumber(node.position.x), isValid: true },
        y: { value: this.formatNumber(node.position.y), isValid: true },
        z: { value: this.formatNumber(node.position.z), isValid: true },
      };

      // Rotation (2D, only Z)
      this.rotationValues = {
        x: { value: '0', isValid: true },
        y: { value: '0', isValid: true },
        z: { value: this.formatNumber(this.radToDeg(node.rotation.z)), isValid: true },
      };

      // Scale (2D)
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
        z: { value: this.formatNumber(node.position.z), isValid: true },
      };

      this.rotationValues = {
        x: { value: '0', isValid: true },
        y: { value: '0', isValid: true },
        z: { value: this.formatNumber(this.radToDeg(node.rotation.z)), isValid: true },
      };

      this.scaleValues = {
        x: { value: this.formatNumber(node.scale.x), isValid: true },
        y: { value: this.formatNumber(node.scale.y), isValid: true },
        z: { value: this.formatNumber(node.scale.z), isValid: true },
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
    this.sizeValues = {
      width: { value: '100', isValid: true },
      height: { value: '100', isValid: true },
    };
  }

  private formatNumber(value: number): string {
    return parseFloat(value.toFixed(4)).toString();
  }

  private radToDeg(rad: number): number {
    return rad * (180 / Math.PI);
  }

  private async handleNameInput(e: Event) {
    const input = e.target as HTMLInputElement;
    this.nameValue = input.value;

    if (this.primaryNode) {
      const op = new UpdateObjectPropertyOperation({
        nodeId: this.primaryNode.nodeId,
        propertyPath: 'name',
        value: input.value,
      });

      try {
        await this.operationService.invokeAndPush(op);
      } catch (error) {
        console.error('[InspectorPanel] Failed to execute name update command', error);
      }
    }
  }

  private async handleVisibilityChange(e: Event) {
    const checkbox = e.target as HTMLInputElement;
    this.visibleValue = checkbox.checked;

    if (this.primaryNode) {
      const op = new UpdateObjectPropertyOperation({
        nodeId: this.primaryNode.nodeId,
        propertyPath: 'visible',
        value: checkbox.checked,
      });

      try {
        await this.operationService.invokeAndPush(op);
      } catch (error) {
        console.error('[InspectorPanel] Failed to execute visibility update command', error);
        // Revert the UI state on error
        this.visibleValue = !checkbox.checked;
      }
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

  private async applyTransformToNode(
    field: 'position' | 'rotation' | 'scale',
    axis: 'x' | 'y' | 'z',
    value: number
  ) {
    if (!this.primaryNode) return;

    const op = new UpdateObjectPropertyOperation({
      nodeId: this.primaryNode.nodeId,
      propertyPath: `${field}.${axis}`,
      value: value,
    });

    try {
      await this.operationService.invokeAndPush(op);
    } catch (error) {
      console.error('[InspectorPanel] Failed to execute transform update command', error);
    }
  }

  private handleSizeInput(dimension: 'width' | 'height', e: Event) {
    const input = e.target as HTMLInputElement;
    const value = input.value;
    const num = parseFloat(value);
    const isValid = !isNaN(num);

    this.sizeValues = { ...this.sizeValues, [dimension]: { value, isValid } };

    if (isValid && this.primaryNode instanceof Group2D) {
      this.applySizeToGroup2D(dimension, num);
    }
  }

  private handleSizeBlur(dimension: 'width' | 'height', e: Event) {
    const input = e.target as HTMLInputElement;
    let num = parseFloat(input.value);
    if (isNaN(num)) num = 100;

    const formattedValue = this.formatNumber(num);
    this.sizeValues = { ...this.sizeValues, [dimension]: { value: formattedValue, isValid: true } };

    if (this.primaryNode instanceof Group2D) {
      this.applySizeToGroup2D(dimension, num);
    }
  }

  private async applySizeToGroup2D(dimension: 'width' | 'height', value: number) {
    if (!this.primaryNode || !(this.primaryNode instanceof Group2D)) return;

    try {
      const command = new UpdateGroup2DSizeCommand({
        nodeId: this.primaryNode.nodeId,
        width: dimension === 'width' ? value : this.primaryNode.width,
        height: dimension === 'height' ? value : this.primaryNode.height,
      });

      await this.commandDispatcher.execute(command);
    } catch (error) {
      console.error('[InspectorPanel] Failed to execute size update command', error);
    }
  }

  protected render() {
    const hasSelection = this.selectedNodes.length > 0;

    return html`
      <pix3-panel
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
    if (!(this.primaryNode instanceof Node3D) && !(this.primaryNode instanceof Sprite2D) && !(this.primaryNode instanceof Group2D)) {
      return '';
    }

    const isGroup2D = this.primaryNode instanceof Group2D;

    return html`
      ${isGroup2D ? this.renderGroup2DSizeProperties() : ''}
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

  private renderGroup2DSizeProperties() {
    return html`
      <div class="size-section">
        <h4 class="subsection-title">Size</h4>
        <div class="property-group">
          <span class="property-label">Width:</span>
          <input
            type="number"
            step="0.01"
            class="property-input property-input--number ${this.sizeValues.width.isValid
              ? ''
              : 'property-input--invalid'}"
            .value=${this.sizeValues.width.value}
            @input=${(e: Event) => this.handleSizeInput('width', e)}
            @blur=${(e: Event) => this.handleSizeBlur('width', e)}
          />
        </div>
        <div class="property-group">
          <span class="property-label">Height:</span>
          <input
            type="number"
            step="0.01"
            class="property-input property-input--number ${this.sizeValues.height.isValid
              ? ''
              : 'property-input--invalid'}"
            .value=${this.sizeValues.height.value}
            @input=${(e: Event) => this.handleSizeInput('height', e)}
            @blur=${(e: Event) => this.handleSizeBlur('height', e)}
          />
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
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-inspector-panel': InspectorPanel;
  }
}
