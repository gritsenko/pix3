import { ComponentBase, customElement, html, state, subscribe, inject } from '@/fw';
import {
  getNodePropertySchema,
  getPropertiesByGroup,
  getPropertyDisplayValue,
} from '@/fw/property-schema-utils';
import { SceneManager } from '@/core/SceneManager';
import { appState } from '@/state';
import type { NodeBase } from '@/nodes/NodeBase';
import type { PropertySchema, PropertyDefinition } from '@/fw';
import { UpdateObjectPropertyOperation } from '@/features/properties/UpdateObjectPropertyOperation';
import { OperationService } from '@/services/OperationService';
import { CommandDispatcher } from '@/services/CommandDispatcher';
import { BehaviorPickerService } from '@/services/BehaviorPickerService';
import { ScriptCreatorService } from '@/services/ScriptCreatorService';
import { ScriptRegistry } from '@/services/ScriptRegistry';
import { IconService } from '@/services/IconService';
import { AttachBehaviorCommand } from '@/features/scripts/AttachBehaviorCommand';
import { DetachBehaviorCommand } from '@/features/scripts/DetachBehaviorCommand';
import { ToggleScriptEnabledCommand } from '@/features/scripts/ToggleScriptEnabledCommand';
import { SetControllerCommand } from '@/features/scripts/SetControllerCommand';
import { ClearControllerCommand } from '@/features/scripts/ClearControllerCommand';

import '../shared/pix3-panel';
import './inspector-panel.ts.css';
import './property-editors';

interface PropertyUIState {
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

  @inject(BehaviorPickerService)
  private readonly behaviorPickerService!: BehaviorPickerService;

  @inject(ScriptCreatorService)
  private readonly scriptCreatorService!: ScriptCreatorService;

  @inject(ScriptRegistry)
  private readonly scriptRegistry!: ScriptRegistry;

  @inject(IconService)
  private readonly iconService!: IconService;

  @state()
  private selectedNodes: NodeBase[] = [];

  @state()
  private primaryNode: NodeBase | null = null;

  @state()
  private propertySchema: PropertySchema | null = null;

  @state()
  private propertyValues: Record<string, PropertyUIState> = {};

  private disposeSelectionSubscription?: () => void;
  private disposeSceneSubscription?: () => void;
  private scriptCreatorRequestedHandler?: (e: Event) => void;

  connectedCallback() {
    super.connectedCallback();
    this.disposeSelectionSubscription = subscribe(appState.selection, () => {
      this.updateSelectedNodes();
    });
    this.disposeSceneSubscription = subscribe(appState.scenes, () => {
      this.updateSelectedNodes();
    });
    this.updateSelectedNodes();

    // Listen for script creator requested event from editor shell
    this.scriptCreatorRequestedHandler = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { type } = customEvent.detail;
      void this.handleScriptCreatorRequested(type);
    };
    window.addEventListener('script-creator-requested', this.scriptCreatorRequestedHandler as EventListener);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.disposeSelectionSubscription?.();
    this.disposeSelectionSubscription = undefined;
    this.disposeSceneSubscription?.();
    this.disposeSceneSubscription = undefined;
    if (this.scriptCreatorRequestedHandler) {
      window.removeEventListener('script-creator-requested', this.scriptCreatorRequestedHandler as EventListener);
      this.scriptCreatorRequestedHandler = undefined;
    }
  }

  private async handleScriptCreatorRequested(type: 'behavior' | 'controller'): Promise<void> {
    if (!this.primaryNode) return;

    const defaultName = this.primaryNode.name || 'NewScript';
    const scriptName = await this.scriptCreatorService.showCreator({
      scriptName: defaultName,
      scriptType: type,
    });

    if (scriptName) {
      // Wait a bit for compilation to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Find the newly created script in the registry
      const scriptId = `project:${scriptName}.ts:${scriptName}${type === 'controller' ? 'Controller' : 'Behavior'}`;
      
      if (type === 'controller') {
        const controllerType = this.scriptRegistry.getControllerType(scriptId);
        if (controllerType) {
          const command = new SetControllerCommand({
            nodeId: this.primaryNode.nodeId,
            controllerType: controllerType.id,
          });
          void this.commandDispatcher.execute(command);
        }
      } else {
        const behaviorType = this.scriptRegistry.getBehaviorType(scriptId);
        if (behaviorType) {
          const behaviorId = `${behaviorType.id}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          const command = new AttachBehaviorCommand({
            nodeId: this.primaryNode.nodeId,
            behaviorType: behaviorType.id,
            behaviorId,
          });
          void this.commandDispatcher.execute(command);
        }
      }
    }
  }

  private updateSelectedNodes(): void {
    const { nodeIds, primaryNodeId } = appState.selection;
    const activeSceneId = appState.scenes.activeSceneId;

    if (!activeSceneId) {
      this.selectedNodes = [];
      this.primaryNode = null;
      this.propertySchema = null;
      return;
    }

    const sceneGraph = this.sceneManager.getSceneGraph(activeSceneId);
    if (!sceneGraph) {
      this.selectedNodes = [];
      this.primaryNode = null;
      this.propertySchema = null;
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
      this.propertySchema = null;
      this.propertyValues = {};
      return;
    }

    // Get the schema for this node
    this.propertySchema = getNodePropertySchema(this.primaryNode);

    // Initialize UI values from node properties
    const values: Record<string, PropertyUIState> = {};
    for (const prop of this.propertySchema.properties) {
      if (prop.ui?.hidden || prop.ui?.readOnly) {
        continue; // Skip hidden or read-only properties
      }
      const displayValue = getPropertyDisplayValue(this.primaryNode, prop);
      values[prop.name] = {
        value: displayValue,
        isValid: true,
      };
    }
    this.propertyValues = values;
  }

  private async handlePropertyInput(propName: string, e: Event) {
    const input = e.target as HTMLInputElement;
    const value = input.value;
    const num = parseFloat(value);
    const isValid = !isNaN(num) || input.type !== 'number';

    // Update local state
    this.propertyValues = {
      ...this.propertyValues,
      [propName]: { value, isValid },
    };

    // Apply if valid and node selected
    if (isValid && this.primaryNode && this.propertySchema) {
      await this.applyPropertyChange(propName, num);
    }
  }

  private async handlePropertyBlur(propName: string, e: Event) {
    const input = e.target as HTMLInputElement;
    let value = input.value;

    // For number inputs, format the value
    if (input.type === 'number') {
      let num = parseFloat(value);
      if (isNaN(num)) num = 0;
      value = parseFloat(num.toFixed(4)).toString();
    }

    // Update local state
    this.propertyValues = {
      ...this.propertyValues,
      [propName]: { value, isValid: true },
    };

    if (this.primaryNode && this.propertySchema) {
      await this.applyPropertyChange(propName, value);
    }
  }

  private async applyPropertyChange(propertyName: string, value: unknown) {
    if (!this.primaryNode || !this.propertySchema) return;

    // Find the property definition
    const propDef = this.propertySchema.properties.find(p => p.name === propertyName);
    if (!propDef) return;

    const op = new UpdateObjectPropertyOperation({
      nodeId: this.primaryNode.nodeId,
      propertyPath: propertyName,
      value,
    });

    try {
      await this.operationService.invokeAndPush(op);
    } catch (error) {
      console.error('[InspectorPanel] Failed to update property', propertyName, error);
      // Revert UI state on error
      const displayValue = getPropertyDisplayValue(this.primaryNode, propDef);
      this.propertyValues = {
        ...this.propertyValues,
        [propertyName]: { value: displayValue, isValid: true },
      };
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
    if (!this.primaryNode || !this.propertySchema) {
      return '';
    }

    const nodeType = this.primaryNode.type;
    const groupedProps = getPropertiesByGroup(this.propertySchema);

    // Sort groups: 'Base' first, then others
    const sortedGroups = Array.from(groupedProps.entries()).sort(([nameA], [nameB]) => {
      if (nameA === 'Base') return -1;
      if (nameB === 'Base') return 1;
      return nameA.localeCompare(nameB);
    });

    return html`
      <div class="property-section">
        <div class="section-header">
          <h3 class="section-title">Object Inspector</h3>
          ${this.selectedNodes.length > 1
            ? html`<p class="selection-info">${this.selectedNodes.length} objects selected</p>`
            : ''}
          <p class="node-type">${nodeType}</p>
        </div>

        ${sortedGroups.map(([groupName, props]) => this.renderPropertyGroup(groupName, props))}
        ${this.renderScriptsSection()}
      </div>
    `;
  }

  private renderScriptsSection() {
    if (!this.primaryNode) return '';

    const behaviors = this.primaryNode.behaviors || [];
    const controller = this.primaryNode.controller;

    return html`
      <div class="property-group-section scripts-section">
        <div class="group-header">
          <h4 class="group-title">Scripts & Behaviors</h4>
          <div class="group-actions">
            <button class="btn-add-behavior" @click=${this.onSetController} title="Set Controller">
              ${this.iconService.getIcon('zap', 14)}
            </button>
            <button class="btn-add-behavior" @click=${this.onAddBehavior} title="Add Behavior">
              ${this.iconService.getIcon('plus', 14)}
            </button>
          </div>
        </div>

        <div class="scripts-list">
          ${controller
            ? html`
                <div class="script-item controller-item">
                  <div class="script-icon">${this.iconService.getIcon('zap', 16)}</div>
                  <div class="script-info">
                    <div class="script-name">${controller.type} (Controller)</div>
                  </div>
                  <div class="script-actions">
                    <button
                      class="btn-icon"
                      @click=${() => this.onToggleController(!controller.enabled)}
                      title=${controller.enabled ? 'Disable' : 'Enable'}
                    >
                      ${this.iconService.getIcon(
                        controller.enabled ? 'check-circle' : 'circle',
                        16
                      )}
                    </button>
                    <button
                      class="btn-icon"
                      @click=${() => this.onRemoveController()}
                      title="Remove"
                    >
                      ${this.iconService.getIcon('trash-2', 16)}
                    </button>
                  </div>
                </div>
              `
            : ''}
          ${behaviors.map(
            b => html`
              <div class="script-item behavior-item">
                <div class="script-icon">${this.iconService.getIcon('zap', 16)}</div>
                <div class="script-info">
                  <div class="script-name">${b.type}</div>
                </div>
                <div class="script-actions">
                  <button
                    class="btn-icon"
                    @click=${() => this.onToggleBehavior(b.id, !b.enabled)}
                    title=${b.enabled ? 'Disable' : 'Enable'}
                  >
                    ${this.iconService.getIcon(b.enabled ? 'check-circle' : 'circle', 16)}
                  </button>
                  <button
                    class="btn-icon"
                    @click=${() => this.onRemoveBehavior(b.id)}
                    title="Remove"
                  >
                    ${this.iconService.getIcon('trash-2', 16)}
                  </button>
                </div>
              </div>
            `
          )}
          ${!controller && behaviors.length === 0
            ? html`<div class="no-scripts">No scripts attached</div>`
            : ''}
        </div>
      </div>
    `;
  }

  private async onAddBehavior() {
    if (!this.primaryNode) return;

    const behavior = await this.behaviorPickerService.showPicker('behavior');
    if (behavior) {
      const behaviorId = `${behavior.id}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const command = new AttachBehaviorCommand({
        nodeId: this.primaryNode.nodeId,
        behaviorType: behavior.id,
        behaviorId,
      });
      void this.commandDispatcher.execute(command);
    }
  }

  private async onSetController() {
    if (!this.primaryNode) return;

    const controller = await this.behaviorPickerService.showPicker('controller');
    if (controller) {
      const command = new SetControllerCommand({
        nodeId: this.primaryNode.nodeId,
        controllerType: controller.id,
      });
      void this.commandDispatcher.execute(command);
    }
  }

  private onRemoveBehavior(behaviorId: string) {
    if (!this.primaryNode) return;

    const command = new DetachBehaviorCommand({
      nodeId: this.primaryNode.nodeId,
      behaviorId,
    });
    void this.commandDispatcher.execute(command);
  }

  private onRemoveController() {
    if (!this.primaryNode || !this.primaryNode.controller) return;

    const command = new ClearControllerCommand({ nodeId: this.primaryNode.nodeId });
    void this.commandDispatcher.execute(command);
  }

  private onToggleBehavior(behaviorId: string, enabled: boolean) {
    if (!this.primaryNode) return;

    const command = new ToggleScriptEnabledCommand({
      nodeId: this.primaryNode.nodeId,
      scriptType: 'behavior',
      scriptId: behaviorId,
      enabled,
    });
    void this.commandDispatcher.execute(command);
  }

  private onToggleController(enabled: boolean) {
    if (!this.primaryNode) return;

    const command = new ToggleScriptEnabledCommand({
      nodeId: this.primaryNode.nodeId,
      scriptType: 'controller',
      enabled,
    });
    void this.commandDispatcher.execute(command);
  }

  private renderPropertyGroup(groupName: string, props: PropertyDefinition[]) {
    const groupDef = this.propertySchema?.groups?.[groupName];
    const label = groupDef?.label || groupName;

    // Filter out hidden and read-only properties
    const visibleProps = props.filter(p => !p.ui?.hidden);

    if (visibleProps.length === 0) {
      return '';
    }

    // Special handling for Transform group - render as grid
    if (groupName === 'Transform') {
      return this.renderTransformGroup(label, visibleProps);
    }

    return html`
      <div class="property-group-section">
        <h4 class="group-title">${label}</h4>
        ${visibleProps.map(prop => this.renderPropertyInput(prop))}
      </div>
    `;
  }

  private renderTransformGroup(label: string, props: PropertyDefinition[]) {
    if (!this.primaryNode) {
      return '';
    }

    return html`
      <div class="property-group-section transform-section">
        <h4 class="group-title">${label}</h4>
        ${props.map(prop => this.renderTransformProperty(prop))}
      </div>
    `;
  }

  private renderTransformProperty(prop: PropertyDefinition) {
    if (!this.primaryNode || !this.propertyValues[prop.name]) {
      return '';
    }

    const state = this.propertyValues[prop.name];
    const label = prop.ui?.label || prop.name;
    const readOnly = prop.ui?.readOnly;

    // For vector properties, render as grid
    if (prop.type === 'vector2' || prop.type === 'vector3' || prop.type === 'euler') {
      let value = { x: 0, y: 0, z: 0 };
      try {
        value = typeof state.value === 'string' ? JSON.parse(state.value) : state.value;
      } catch {
        console.warn(`Failed to parse vector value for ${prop.name}:`, state.value);
      }

      if (prop.type === 'vector2') {
        return html`
          <div class="transform-subsection">
            <div class="subsection-title">
              ${label}
              <button class="reset-button" title="Reset to default">↻</button>
            </div>
            <div class="transform-fields">
              <div class="transform-field-label">X</div>
              <input
                type="number"
                class="transform-field-input"
                step=${prop.ui?.step ?? 0.01}
                .value=${value.x.toFixed(prop.ui?.precision ?? 2)}
                ?disabled=${readOnly}
                @change=${(e: Event) => {
                  const newX = parseFloat((e.target as HTMLInputElement).value);
                  this.applyPropertyChange(prop.name, { x: newX, y: value.y });
                }}
              />

              <div class="transform-field-label">Y</div>
              <input
                type="number"
                class="transform-field-input"
                step=${prop.ui?.step ?? 0.01}
                .value=${value.y.toFixed(prop.ui?.precision ?? 2)}
                ?disabled=${readOnly}
                @change=${(e: Event) => {
                  const newY = parseFloat((e.target as HTMLInputElement).value);
                  this.applyPropertyChange(prop.name, { x: value.x, y: newY });
                }}
              />

              <div></div>
              <div></div>
            </div>
          </div>
        `;
      }

      if (prop.type === 'vector3') {
        return html`
          <div class="transform-subsection">
            <div class="subsection-title">
              ${label}
              <button class="reset-button" title="Reset to default">↻</button>
            </div>
            <div class="transform-fields">
              <div class="transform-field-label">X</div>
              <input
                type="number"
                class="transform-field-input"
                step=${prop.ui?.step ?? 0.01}
                .value=${value.x.toFixed(prop.ui?.precision ?? 2)}
                ?disabled=${readOnly}
                @change=${(e: Event) => {
                  const newX = parseFloat((e.target as HTMLInputElement).value);
                  this.applyPropertyChange(prop.name, { x: newX, y: value.y, z: value.z });
                }}
              />

              <div class="transform-field-label">Y</div>
              <input
                type="number"
                class="transform-field-input"
                step=${prop.ui?.step ?? 0.01}
                .value=${value.y.toFixed(prop.ui?.precision ?? 2)}
                ?disabled=${readOnly}
                @change=${(e: Event) => {
                  const newY = parseFloat((e.target as HTMLInputElement).value);
                  this.applyPropertyChange(prop.name, { x: value.x, y: newY, z: value.z });
                }}
              />

              <div class="transform-field-label">Z</div>
              <input
                type="number"
                class="transform-field-input"
                step=${prop.ui?.step ?? 0.01}
                .value=${value.z.toFixed(prop.ui?.precision ?? 2)}
                ?disabled=${readOnly}
                @change=${(e: Event) => {
                  const newZ = parseFloat((e.target as HTMLInputElement).value);
                  this.applyPropertyChange(prop.name, { x: value.x, y: value.y, z: newZ });
                }}
              />
            </div>
          </div>
        `;
      }

      if (prop.type === 'euler') {
        return html`
          <div class="transform-subsection">
            <div class="subsection-title">
              ${label}
              <button class="reset-button" title="Reset to default">↻</button>
            </div>
            <div class="transform-fields">
              <div class="transform-field-label">X</div>
              <input
                type="number"
                class="transform-field-input"
                step=${prop.ui?.step ?? 0.1}
                .value=${value.x.toFixed(prop.ui?.precision ?? 1)}
                ?disabled=${readOnly}
                @change=${(e: Event) => {
                  const newX = parseFloat((e.target as HTMLInputElement).value);
                  this.applyPropertyChange(prop.name, { x: newX, y: value.y, z: value.z });
                }}
              />

              <div class="transform-field-label">Y</div>
              <input
                type="number"
                class="transform-field-input"
                step=${prop.ui?.step ?? 0.1}
                .value=${value.y.toFixed(prop.ui?.precision ?? 1)}
                ?disabled=${readOnly}
                @change=${(e: Event) => {
                  const newY = parseFloat((e.target as HTMLInputElement).value);
                  this.applyPropertyChange(prop.name, { x: value.x, y: newY, z: value.z });
                }}
              />

              <div class="transform-field-label">Z</div>
              <input
                type="number"
                class="transform-field-input"
                step=${prop.ui?.step ?? 0.1}
                .value=${value.z.toFixed(prop.ui?.precision ?? 1)}
                ?disabled=${readOnly}
                @change=${(e: Event) => {
                  const newZ = parseFloat((e.target as HTMLInputElement).value);
                  this.applyPropertyChange(prop.name, { x: value.x, y: value.y, z: newZ });
                }}
              />
            </div>
          </div>
        `;
      }
    }

    // For single number properties in transform group
    if (prop.type === 'number') {
      return html`
        <div class="property-group">
          <span class="property-label">${label}${prop.ui?.unit ? ` (${prop.ui.unit})` : ''}</span>
          <input
            type="number"
            step=${prop.ui?.step ?? 0.01}
            class="property-input property-input--number ${state.isValid
              ? ''
              : 'property-input--invalid'}"
            .value=${state.value}
            ?disabled=${readOnly}
            @input=${(e: Event) => this.handlePropertyInput(prop.name, e)}
            @blur=${(e: Event) => this.handlePropertyBlur(prop.name, e)}
          />
        </div>
      `;
    }

    return '';
  }

  private renderPropertyInput(prop: PropertyDefinition) {
    if (!this.primaryNode || !this.propertyValues[prop.name]) {
      return '';
    }

    const state = this.propertyValues[prop.name];
    const label = prop.ui?.label || prop.name;
    const readOnly = prop.ui?.readOnly;

    if (prop.type === 'boolean') {
      return html`
        <div class="property-group">
          <label class="property-label property-label--checkbox">
            <input
              type="checkbox"
              class="property-checkbox"
              .checked=${state.value === 'true'}
              ?disabled=${readOnly}
              @change=${(e: Event) =>
                this.applyPropertyChange(prop.name, (e.target as HTMLInputElement).checked)}
            />
            ${label}
          </label>
        </div>
      `;
    }

    if (prop.type === 'vector2') {
      let value = { x: 0, y: 0 };
      try {
        value = typeof state.value === 'string' ? JSON.parse(state.value) : state.value;
      } catch {
        console.warn(`Failed to parse vector2 value for ${prop.name}:`, state.value);
      }
      return html`
        <div class="property-group">
          <span class="property-label">${label}</span>
          <pix3-vector2-editor
            .x=${value.x}
            .y=${value.y}
            step=${prop.ui?.step ?? 0.01}
            precision=${prop.ui?.precision ?? 2}
            ?disabled=${readOnly}
            @change=${(e: CustomEvent) => this.applyPropertyChange(prop.name, e.detail)}
          ></pix3-vector2-editor>
        </div>
      `;
    }

    if (prop.type === 'vector3') {
      let value = { x: 0, y: 0, z: 0 };
      try {
        value = typeof state.value === 'string' ? JSON.parse(state.value) : state.value;
      } catch {
        console.warn(`Failed to parse vector3 value for ${prop.name}:`, state.value);
      }
      return html`
        <div class="property-group">
          <span class="property-label">${label}</span>
          <pix3-vector3-editor
            .x=${value.x}
            .y=${value.y}
            .z=${value.z}
            step=${prop.ui?.step ?? 0.01}
            precision=${prop.ui?.precision ?? 2}
            ?disabled=${readOnly}
            @change=${(e: CustomEvent) => this.applyPropertyChange(prop.name, e.detail)}
          ></pix3-vector3-editor>
        </div>
      `;
    }

    if (prop.type === 'euler') {
      let value = { x: 0, y: 0, z: 0 };
      try {
        value = typeof state.value === 'string' ? JSON.parse(state.value) : state.value;
      } catch {
        console.warn(`Failed to parse euler value for ${prop.name}:`, state.value);
      }
      return html`
        <div class="property-group">
          <span class="property-label">${label}</span>
          <pix3-euler-editor
            .x=${value.x}
            .y=${value.y}
            .z=${value.z}
            step=${prop.ui?.step ?? 0.1}
            precision=${prop.ui?.precision ?? 1}
            ?disabled=${readOnly}
            @change=${(e: CustomEvent) => this.applyPropertyChange(prop.name, e.detail)}
          ></pix3-euler-editor>
        </div>
      `;
    }

    if (prop.type === 'number') {
      return html`
        <div class="property-group">
          <span class="property-label">${label}${prop.ui?.unit ? ` (${prop.ui.unit})` : ''}</span>
          <input
            type="number"
            step=${prop.ui?.step ?? 0.01}
            class="property-input property-input--number ${state.isValid
              ? ''
              : 'property-input--invalid'}"
            .value=${state.value}
            ?disabled=${readOnly}
            @input=${(e: Event) => this.handlePropertyInput(prop.name, e)}
            @blur=${(e: Event) => this.handlePropertyBlur(prop.name, e)}
          />
        </div>
      `;
    }

    if (prop.type === 'string') {
      return html`
        <div class="property-group">
          <label class="property-label">
            ${label}:
            <input
              type="text"
              class="property-input property-input--text"
              .value=${state.value}
              ?disabled=${readOnly}
              @input=${(e: Event) => this.handlePropertyInput(prop.name, e)}
              @blur=${(e: Event) => this.handlePropertyBlur(prop.name, e)}
            />
          </label>
        </div>
      `;
    }

    // Default fallback for other types
    return html`
      <div class="property-group">
        <label class="property-label">
          ${label}:
          <input
            type="text"
            class="property-input property-input--text"
            .value=${state.value}
            ?disabled=${readOnly}
            @input=${(e: Event) => this.handlePropertyInput(prop.name, e)}
          />
        </label>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-inspector-panel': InspectorPanel;
  }
}
