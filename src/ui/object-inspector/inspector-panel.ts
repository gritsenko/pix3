import { ComponentBase, customElement, html, state, subscribe, inject } from '@/fw';
import {
  getNodePropertySchema,
  getPropertiesByGroup,
  getPropertyDisplayValue,
  Group2D,
  LAYOUT_PRESETS,
  type LayoutPreset,
  MeshInstance,
} from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { appState } from '@/state';
import type { NodeBase } from '@pix3/runtime';
import type { PropertySchema, PropertyDefinition } from '@/fw';
import { UpdateObjectPropertyOperation } from '@/features/properties/UpdateObjectPropertyOperation';
import { OperationService } from '@/services/OperationService';
import { CommandDispatcher } from '@/services/CommandDispatcher';
import { BehaviorPickerService } from '@/services/BehaviorPickerService';
import { ScriptCreatorService } from '@/services/ScriptCreatorService';
import { ScriptRegistry } from '@pix3/runtime';
import { IconService } from '@/services/IconService';
import { DialogService } from '@/services/DialogService';
import { FileSystemAPIService } from '@/services/FileSystemAPIService';
import { AssetsPreviewService, type AssetPreviewItem } from '@/services';
import { ViewportRendererService } from '@/services/ViewportRenderService';
import { AddComponentCommand } from '@/features/scripts/AddComponentCommand';
import { RemoveComponentCommand } from '@/features/scripts/RemoveComponentCommand';
import { ToggleScriptEnabledCommand } from '@/features/scripts/ToggleScriptEnabledCommand';

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

  @inject(DialogService)
  private readonly dialogService!: DialogService;

  @inject(FileSystemAPIService)
  private readonly fileSystemAPI!: FileSystemAPIService;

  @inject(AssetsPreviewService)
  private readonly assetsPreviewService!: AssetsPreviewService;

  @inject(ViewportRendererService)
  private readonly viewportService!: ViewportRendererService;

  @state()
  private selectedNodes: NodeBase[] = [];

  @state()
  private primaryNode: NodeBase | null = null;

  @state()
  private propertySchema: PropertySchema | null = null;

  @state()
  private propertyValues: Record<string, PropertyUIState> = {};

  @state()
  private selectedAssetItem: AssetPreviewItem | null = null;

  @state()
  private activePreviewAnimation: string | null = null;

  private disposeSelectionSubscription?: () => void;
  private disposeSceneSubscription?: () => void;
  private disposeAssetPreviewSubscription?: () => void;
  private scriptCreatorRequestedHandler?: (e: Event) => void;

  connectedCallback() {
    super.connectedCallback();
    this.disposeSelectionSubscription = subscribe(appState.selection, () => {
      this.updateSelectedNodes();
    });
    this.disposeSceneSubscription = subscribe(appState.scenes, () => {
      this.updateSelectedNodes();
    });
    this.disposeAssetPreviewSubscription = this.assetsPreviewService.subscribe(snapshot => {
      this.selectedAssetItem = snapshot.selectedItem;
      this.requestUpdate();
    });
    this.updateSelectedNodes();

    // Listen for script creator requested event from editor shell
    this.scriptCreatorRequestedHandler = (_e: Event) => {
      void this.handleScriptCreatorRequested();
    };
    window.addEventListener(
      'script-creator-requested',
      this.scriptCreatorRequestedHandler as EventListener
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.disposeSelectionSubscription?.();
    this.disposeSelectionSubscription = undefined;
    this.disposeSceneSubscription?.();
    this.disposeSceneSubscription = undefined;
    this.disposeAssetPreviewSubscription?.();
    this.disposeAssetPreviewSubscription = undefined;
    if (this.scriptCreatorRequestedHandler) {
      window.removeEventListener(
        'script-creator-requested',
        this.scriptCreatorRequestedHandler as EventListener
      );
      this.scriptCreatorRequestedHandler = undefined;
    }
  }

  private toUrlSafeClassName(name: string): string {
    let cleaned = name;

    // Remove invalid characters (keep only alphanumeric and spaces)
    cleaned = cleaned.replace(/[^a-zA-Z0-9_\s]/g, '');

    // Convert to PascalCase:
    // 1. Split by spaces and underscores
    // 2. Capitalize first letter of each word
    // 3. Join together
    const words = cleaned.split(/[\s_]+/).filter(w => w.length > 0);
    const pascalCase = words
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');

    // If result is empty, use default
    return pascalCase || 'New';
  }

  private async checkIfScriptFileExists(fileName: string): Promise<boolean> {
    try {
      const entries = await this.fileSystemAPI.listDirectory('scripts');
      return entries.some(e => e.kind === 'file' && e.name === fileName);
    } catch {
      // Directory might not exist yet
      console.log('[InspectorPanel] scripts directory does not exist yet');
      return false;
    }
  }

  private async handleScriptCreatorRequested(): Promise<void> {
    if (!this.primaryNode) return;

    const defaultName = this.primaryNode.name || 'NewScript';
    const urlSafeBaseName = this.toUrlSafeClassName(defaultName);
    const fullClassName = `${urlSafeBaseName}`;
    const fileName = `${fullClassName}.ts`;

    // Check if file already exists
    const fileExists = await this.checkIfScriptFileExists(fileName);
    if (fileExists) {
      await this.dialogService.showConfirmation({
        title: 'Script Already Exists',
        message: `A script file named "${fileName}" already exists in the scripts/ folder. Please choose a different name.`,
        confirmLabel: 'OK',
        cancelLabel: 'Cancel',
        isDangerous: false,
      });
      return;
    }

    const scriptName = await this.scriptCreatorService.showCreator({
      scriptName: urlSafeBaseName,
    });

    if (scriptName) {
      // Wait a bit for compilation to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Find the newly created script in the registry
      const scriptId = `user:${scriptName}`;

      const componentType = this.scriptRegistry.getComponentType(scriptId);
      if (componentType) {
        const componentId = `${componentType.id}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const command = new AddComponentCommand({
          nodeId: this.primaryNode.nodeId,
          componentType: componentType.id,
          componentId,
        });
        void this.commandDispatcher.execute(command);
      }
    }
  }

  private updateSelectedNodes(): void {
    const { nodeIds, primaryNodeId } = appState.selection;
    const activeSceneId = appState.scenes.activeSceneId;

    if (nodeIds.length > 0 && this.selectedAssetItem) {
      this.assetsPreviewService.clearSelectedItem();
    }

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

    // Reset animation preview when selection changes
    const prevPrimaryId = this.primaryNode?.nodeId;
    const newPrimaryId = primaryNodeId ?? (nodeIds[0] ?? null);
    if (prevPrimaryId !== newPrimaryId && this.activePreviewAnimation !== null) {
      if (prevPrimaryId) {
        this.viewportService.setPreviewAnimation(prevPrimaryId, null);
      }
      this.activePreviewAnimation = null;
    }

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
    const rawValue = input.value;

    const propDef = this.propertySchema?.properties.find(p => p.name === propName);
    const expectsNumber = propDef?.type === 'number' || input.type === 'number';

    const numericValue = parseFloat(rawValue);
    const parsedValue: unknown = expectsNumber ? numericValue : rawValue;
    const isValid = expectsNumber ? !isNaN(numericValue) : true;

    // Update local state
    this.propertyValues = {
      ...this.propertyValues,
      [propName]: { value: rawValue, isValid },
    };

    // Apply if valid and node selected
    if (isValid && this.primaryNode && this.propertySchema) {
      await this.applyPropertyChange(propName, parsedValue);
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
    const hasAssetSelection = this.selectedAssetItem !== null;

    return html`
      <pix3-panel
        panel-role="form"
        panel-description="Adjust properties for the currently selected node."
        actions-label="Inspector actions"
      >
        <div class="inspector-body">
          ${hasAssetSelection ? this.renderAssetProperties() : hasSelection ? this.renderProperties() : ''}
        </div>
      </pix3-panel>
    `;
  }

  private renderAssetProperties() {
    if (!this.selectedAssetItem) {
      return '';
    }

    const asset = this.selectedAssetItem;
    const isImage = asset.previewType === 'image' && asset.thumbnailUrl !== null;

    return html`
      <div class="property-section">
        <div class="section-header">
          <h3 class="section-title">Asset Inspector</h3>
          <p class="node-type">${asset.extension ? asset.extension.toUpperCase() : 'FILE'}</p>
        </div>

        <div class="property-group-section asset-section">
          <h4 class="group-title">Preview</h4>
          ${isImage
        ? html`
                <div class="asset-image-preview checker-bg">
                  <img src=${asset.thumbnailUrl!} alt=${asset.name} />
                </div>
              `
        : html`
                <div class="asset-file-icon">
                  ${this.iconService.getIcon(asset.iconName, 42)}
                </div>
              `}
        </div>

        <div class="property-group-section asset-section">
          <h4 class="group-title">Properties</h4>
          <div class="property-group">
            <span class="property-label">Name</span>
            <span class="asset-value">${asset.name}</span>
          </div>
          <div class="property-group">
            <span class="property-label">Path</span>
            <span class="asset-value asset-path">${asset.path}</span>
          </div>
          ${asset.width !== null && asset.height !== null
        ? html`
                <div class="property-group">
                  <span class="property-label">Resolution</span>
                  <span class="asset-value">${asset.width} x ${asset.height}</span>
                </div>
              `
        : ''}
          <div class="property-group">
            <span class="property-label">Size</span>
            <span class="asset-value">${this.formatFileSize(asset.sizeBytes)}</span>
          </div>
        </div>
      </div>
    `;
  }

  private formatFileSize(sizeBytes: number | null): string {
    if (sizeBytes === null) {
      return '-';
    }
    if (sizeBytes < 1024) {
      return `${sizeBytes} B`;
    }
    const kb = sizeBytes / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(1)} KB`;
    }
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
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
        ${this.renderAnimationsSection()}
        ${this.renderScriptsSection()}
      </div>
    `;
  }

  private renderAnimationsSection() {
    if (!(this.primaryNode instanceof MeshInstance)) return '';
    const clips = this.primaryNode.animations;
    if (clips.length === 0) return '';

    return html`
      <div class="property-group-section animations-section">
        <h4 class="group-title">Animations</h4>
        <div class="animation-list">
          ${clips.map(clip => {
      const isActive = this.activePreviewAnimation === clip.name;
      return html`
              <button
                class="animation-item ${isActive ? 'animation-item--active' : ''}"
                @click=${() => this.toggleAnimation(clip.name)}
                title=${isActive ? 'Stop animation' : 'Play animation'}
              >
                <span class="animation-play-icon">${isActive ? '⏹' : '▶'}</span>
                <span class="animation-name">${clip.name}</span>
                <span class="animation-duration">${clip.duration.toFixed(2)}s</span>
              </button>
            `;
    })}
        </div>
      </div>
    `;
  }

  private toggleAnimation(name: string) {
    if (!this.primaryNode) return;
    const next = this.activePreviewAnimation === name ? null : name;
    this.activePreviewAnimation = next;
    this.viewportService.setPreviewAnimation(this.primaryNode.nodeId, next);
  }

  private renderScriptsSection() {
    if (!this.primaryNode) return '';

    const components = this.primaryNode.components || [];

    return html`
      <div class="property-group-section scripts-section">
        <div class="group-header">
          <h4 class="group-title">Script Components</h4>
          <div class="group-actions">
            <button class="btn-add-behavior" @click=${this.onAddBehavior} title="Add Component">
              ${this.iconService.getIcon('plus', 14)}
            </button>
          </div>
        </div>

        <div class="scripts-list">
          ${components.map(
      c => html`
              <div class="script-item component-item">
                <div class="script-icon">${this.iconService.getIcon(this.getComponentIconName(c.type), 16)}</div>
                <div class="script-info">
                  <div class="script-name">${c.type}</div>
                </div>
                <div class="script-actions">
                  <button
                    class="btn-icon"
                    @click=${() => this.onToggleComponent(c.id, !c.enabled)}
                    title=${c.enabled ? 'Disable' : 'Enable'}
                  >
                    ${this.iconService.getIcon(c.enabled ? 'check-circle' : 'circle', 16)}
                  </button>
                  <button
                    class="btn-icon"
                    @click=${() => this.onRemoveComponent(c.id)}
                    title="Remove"
                  >
                    ${this.iconService.getIcon('trash-2', 16)}
                  </button>
                </div>
              </div>
            `
    )}
          ${components.length === 0
        ? html`<div class="no-scripts">No components attached</div>`
        : ''}
        </div>
      </div>
    `;
  }

  private getComponentIconName(componentType: string): string {
    if (componentType.startsWith('user:')) {
      return 'code';
    }
    return 'zap';
  }

  private async onAddBehavior() {
    if (!this.primaryNode) return;

    const component = await this.behaviorPickerService.showPicker();
    if (component) {
      const componentId = `${component.id}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const command = new AddComponentCommand({
        nodeId: this.primaryNode.nodeId,
        componentType: component.id,
        componentId,
      });
      void this.commandDispatcher.execute(command);
    }
  }

  private onRemoveComponent(componentId: string) {
    if (!this.primaryNode) return;

    const command = new RemoveComponentCommand({
      nodeId: this.primaryNode.nodeId,
      componentId,
    });
    void this.commandDispatcher.execute(command);
  }

  private onToggleComponent(componentId: string, enabled: boolean) {
    if (!this.primaryNode) return;

    const command = new ToggleScriptEnabledCommand({
      nodeId: this.primaryNode.nodeId,
      componentId,
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

    // Special handling for Layout group - render with presets
    if (groupName === 'Layout' && this.primaryNode instanceof Group2D) {
      return this.renderLayoutGroup(label, visibleProps);
    }

    return html`
      <div class="property-group-section">
        <h4 class="group-title">${label}</h4>
        ${visibleProps.map(prop => this.renderPropertyInput(prop))}
      </div>
    `;
  }

  private renderLayoutGroup(label: string, props: PropertyDefinition[]) {
    if (!this.primaryNode || !(this.primaryNode instanceof Group2D)) {
      return '';
    }

    // Layout preset buttons - organized in rows
    const presetRows: LayoutPreset[][] = [
      ['top-left', 'top-center', 'top-right'],
      ['middle-left', 'center', 'middle-right'],
      ['bottom-left', 'bottom-center', 'bottom-right'],
      ['stretch-horizontal', 'stretch', 'stretch-vertical'],
    ];

    return html`
      <div class="property-group-section layout-section">
        <h4 class="group-title">${label}</h4>

        <div class="layout-presets">
          <div class="preset-label">Anchor Presets</div>
          <div class="preset-grid">
            ${presetRows.map(
      row => html`
                <div class="preset-row">
                  ${row.map(presetId => {
        const preset = LAYOUT_PRESETS[presetId];
        return html`
                      <button
                        class="preset-btn"
                        title=${preset.label}
                        @click=${() => this.applyLayoutPreset(presetId)}
                      >
                        ${this.renderPresetIcon(presetId)}
                      </button>
                    `;
      })}
                </div>
              `
    )}
          </div>
        </div>

        ${props.map(prop => this.renderPropertyInput(prop))}
      </div>
    `;
  }

  private renderPresetIcon(preset: LayoutPreset) {
    // SVG icons representing each layout preset
    const iconMap: Record<LayoutPreset, string> = {
      center: '●',
      stretch: '⬛',
      'top-left': '◤',
      'top-center': '▲',
      'top-right': '◥',
      'middle-left': '◀',
      'middle-right': '▶',
      'bottom-left': '◣',
      'bottom-center': '▼',
      'bottom-right': '◢',
      'stretch-horizontal': '⬌',
      'stretch-vertical': '⬍',
    };
    return iconMap[preset] || '?';
  }

  private applyLayoutPreset(preset: LayoutPreset) {
    if (!this.primaryNode || !(this.primaryNode instanceof Group2D)) return;

    const group = this.primaryNode as Group2D;
    group.applyLayoutPreset(preset);

    // Sync UI values after applying preset
    this.syncValuesFromNode();
    this.requestUpdate();
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
