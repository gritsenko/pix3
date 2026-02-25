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
import type { NodeBase, ScriptComponent } from '@pix3/runtime';
import type { PropertySchema, PropertyDefinition } from '@/fw';
import { UpdateObjectPropertyCommand } from '@/features/properties/UpdateObjectPropertyCommand';
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
import { UpdateComponentPropertyCommand } from '@/features/scripts/UpdateComponentPropertyCommand';
import { AddNodeToGroupCommand } from '@/features/scene/AddNodeToGroupCommand';
import { RemoveNodeFromGroupCommand } from '@/features/scene/RemoveNodeFromGroupCommand';
import {
  findPrefabInstanceRoot,
  getPrefabMetadata,
  type PrefabMetadata,
} from '@/features/scene/prefab-utils';

import '../shared/pix3-panel';
import './inspector-panel.ts.css';
import './property-editors';

interface PropertyUIState {
  value: string;
  isValid: boolean;
}

interface SelectOption {
  value: string;
  label: string;
}

interface TextureResourceValue {
  type: 'texture';
  url: string;
}

const ASSET_RESOURCE_MIME = 'application/x-pix3-asset-resource';
const ASSET_PATH_MIME = 'application/x-pix3-asset-path';
const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'svg',
  'tif',
  'tiff',
  'avif',
]);

@customElement('pix3-inspector-panel')
export class InspectorPanel extends ComponentBase {
  @inject(SceneManager)
  private readonly sceneManager!: SceneManager;

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
  private componentPropertyValues: Record<string, PropertyUIState> = {};

  @state()
  private expandedComponentIds: string[] = [];

  @state()
  private selectedAssetItem: AssetPreviewItem | null = null;

  @state()
  private activePreviewAnimation: string | null = null;

  @state()
  private newGroupName: string = '';

  @state()
  private newGroupError: string | null = null;

  private disposeSelectionSubscription?: () => void;
  private disposeSceneSubscription?: () => void;
  private disposeAssetPreviewSubscription?: () => void;
  private scriptCreatorRequestedHandler?: (e: Event) => void;

  private readonly texturePreviewUrls = new Map<string, string>();
  private readonly texturePreviewLoads = new Set<string>();

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

    // Track focus for context-aware shortcuts
    this.addEventListener('focusin', () => {
      appState.editorContext.focusedArea = 'inspector';
    });

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

    for (const previewUrl of this.texturePreviewUrls.values()) {
      URL.revokeObjectURL(previewUrl);
    }
    this.texturePreviewUrls.clear();
    this.texturePreviewLoads.clear();
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

  private async handleCopyResourceUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch (err) {
      console.error('Failed to copy resource URL:', err);
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
    const newPrimaryId = primaryNodeId ?? nodeIds[0] ?? null;
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
      this.componentPropertyValues = {};
      this.expandedComponentIds = [];
      return;
    }

    // Get the schema for this node
    this.propertySchema = getNodePropertySchema(this.primaryNode);
    this.newGroupError = null;

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
    this.syncComponentValuesFromNode();
  }

  private syncComponentValuesFromNode(): void {
    if (!this.primaryNode) {
      this.componentPropertyValues = {};
      return;
    }

    const values: Record<string, PropertyUIState> = {};
    for (const component of this.primaryNode.components) {
      const schema = this.scriptRegistry.getComponentPropertySchema(component.type);
      if (!schema) {
        continue;
      }
      for (const prop of schema.properties) {
        if (prop.ui?.hidden || prop.ui?.readOnly) {
          continue;
        }
        const key = this.getComponentPropertyKey(component.id, prop.name);
        values[key] = {
          value: this.getPropertyDisplayValue(component, prop),
          isValid: true,
        };
      }
    }
    this.componentPropertyValues = values;
    this.expandedComponentIds = this.expandedComponentIds.filter(componentId =>
      this.primaryNode?.components.some(component => component.id === componentId)
    );
  }

  private getPropertyDisplayValue(target: unknown, prop: PropertyDefinition): string {
    const value = prop.getValue(target);

    if (prop.type === 'number') {
      const num = Number(value);
      if (Number.isNaN(num)) return '0';
      const precision = prop.ui?.precision ?? 2;
      return parseFloat(num.toFixed(precision)).toString();
    }

    if (prop.type === 'boolean') {
      return String(value === true);
    }

    if (
      prop.type === 'vector2' ||
      prop.type === 'vector3' ||
      prop.type === 'vector4' ||
      prop.type === 'euler' ||
      prop.type === 'object'
    ) {
      return JSON.stringify(value);
    }

    return String(value ?? '');
  }

  private getComponentPropertyKey(componentId: string, propertyName: string): string {
    return `${componentId}:${propertyName}`;
  }

  private toTextureResourceValue(rawValue: unknown): TextureResourceValue {
    if (typeof rawValue === 'object' && rawValue !== null) {
      const value = rawValue as { type?: unknown; url?: unknown };
      if (value.type === 'texture' && typeof value.url === 'string') {
        return { type: 'texture', url: value.url };
      }
      if (typeof value.url === 'string') {
        return { type: 'texture', url: value.url };
      }
    }

    if (typeof rawValue === 'string') {
      try {
        const parsed = JSON.parse(rawValue) as unknown;
        return this.toTextureResourceValue(parsed);
      } catch {
        return { type: 'texture', url: rawValue };
      }
    }

    return { type: 'texture', url: '' };
  }

  private getTexturePreviewUrl(textureUrl: string): string {
    const resourceUrl = textureUrl.trim();
    if (!resourceUrl || !this.isImageResource(resourceUrl)) {
      return '';
    }

    if (resourceUrl.startsWith('http://') || resourceUrl.startsWith('https://')) {
      return resourceUrl;
    }

    const cached = this.texturePreviewUrls.get(resourceUrl);
    if (cached) {
      return cached;
    }

    if (resourceUrl.startsWith('res://') && !this.texturePreviewLoads.has(resourceUrl)) {
      this.texturePreviewLoads.add(resourceUrl);
      void (async () => {
        try {
          const blob = await this.fileSystemAPI.readBlob(resourceUrl);
          const objectUrl = URL.createObjectURL(blob);
          this.texturePreviewUrls.set(resourceUrl, objectUrl);
          this.requestUpdate();
        } catch {
          // Keep empty preview when read fails.
        } finally {
          this.texturePreviewLoads.delete(resourceUrl);
        }
      })();
    }

    return '';
  }

  private isImageResource(path: string): boolean {
    const cleaned = path.split('?')[0].split('#')[0];
    const extension = cleaned.includes('.') ? cleaned.split('.').pop()?.toLowerCase() ?? '' : '';
    return IMAGE_EXTENSIONS.has(extension);
  }

  private normalizeDroppedResource(rawValue: string): string | null {
    const value = rawValue.trim();
    if (!value) {
      return null;
    }

    if (value.startsWith('res://') || value.startsWith('http://') || value.startsWith('https://')) {
      return this.isImageResource(value) ? value : null;
    }

    if (value.includes('://')) {
      return null;
    }

    const normalized = value.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\\+/g, '/');
    const resourcePath = `res://${normalized}`;
    return this.isImageResource(resourcePath) ? resourcePath : null;
  }

  private getDroppedTextureResource(event: DragEvent): string | null {
    const transfer = event.dataTransfer;
    if (!transfer) {
      return null;
    }

    const fromResource = transfer.getData(ASSET_RESOURCE_MIME);
    const normalizedResource = this.normalizeDroppedResource(fromResource);
    if (normalizedResource) {
      return normalizedResource;
    }

    const fromPath = transfer.getData(ASSET_PATH_MIME);
    const normalizedPath = this.normalizeDroppedResource(fromPath);
    if (normalizedPath) {
      return normalizedPath;
    }

    const fromUriList = transfer.getData('text/uri-list');
    const normalizedUriList = this.normalizeDroppedResource(fromUriList);
    if (normalizedUriList) {
      return normalizedUriList;
    }

    const plain = transfer.getData('text/plain');
    return this.normalizeDroppedResource(plain);
  }

  private onTextureResourceDrop(propertyName: string, event: DragEvent): void {
    const textureUrl = this.getDroppedTextureResource(event);
    if (!textureUrl) {
      return;
    }

    void this.applyPropertyChange(propertyName, { type: 'texture', url: textureUrl });
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

    const command = new UpdateObjectPropertyCommand({
      nodeId: this.primaryNode.nodeId,
      propertyPath: propertyName,
      value,
    });

    try {
      await this.commandDispatcher.execute(command);
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

  private async handleComponentPropertyInput(
    componentId: string,
    prop: PropertyDefinition,
    e: Event
  ) {
    const input = e.target as HTMLInputElement;
    const rawValue = input.value;
    const key = this.getComponentPropertyKey(componentId, prop.name);

    const expectsNumber = prop.type === 'number' || input.type === 'number';
    const numericValue = parseFloat(rawValue);
    const parsedValue: unknown = expectsNumber ? numericValue : rawValue;
    const isValid = expectsNumber ? !Number.isNaN(numericValue) : true;

    this.componentPropertyValues = {
      ...this.componentPropertyValues,
      [key]: { value: rawValue, isValid },
    };

    if (isValid) {
      await this.applyComponentPropertyChange(componentId, prop, parsedValue);
    }
  }

  private async handleComponentPropertyBlur(
    componentId: string,
    prop: PropertyDefinition,
    e: Event
  ) {
    const input = e.target as HTMLInputElement;
    let value = input.value;
    const key = this.getComponentPropertyKey(componentId, prop.name);

    if (input.type === 'number') {
      let num = parseFloat(value);
      if (Number.isNaN(num)) num = 0;
      value = parseFloat(num.toFixed(4)).toString();
    }

    this.componentPropertyValues = {
      ...this.componentPropertyValues,
      [key]: { value, isValid: true },
    };

    await this.applyComponentPropertyChange(componentId, prop, value);
  }

  private async applyComponentPropertyChange(
    componentId: string,
    propDef: PropertyDefinition,
    value: unknown
  ): Promise<void> {
    if (!this.primaryNode) return;

    const command = new UpdateComponentPropertyCommand({
      nodeId: this.primaryNode.nodeId,
      componentId,
      propertyName: propDef.name,
      value,
    });

    try {
      await this.commandDispatcher.execute(command);
    } catch (error) {
      console.error('[InspectorPanel] Failed to update component property', propDef.name, error);
      const component = this.primaryNode.components.find(c => c.id === componentId);
      if (!component) {
        return;
      }
      const key = this.getComponentPropertyKey(componentId, propDef.name);
      this.componentPropertyValues = {
        ...this.componentPropertyValues,
        [key]: {
          value: this.getPropertyDisplayValue(component, propDef),
          isValid: true,
        },
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
          ${hasAssetSelection
        ? this.renderAssetProperties()
        : hasSelection
          ? this.renderProperties()
          : ''}
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
    const resourceUrl = asset.path === '.' ? 'res://' : `res://${asset.path}`;

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
                <div class="asset-file-icon">${this.iconService.getIcon(asset.iconName, 42)}</div>
              `}
        </div>

        <div class="property-group-section asset-section">
          <h4 class="group-title">Properties</h4>
          <div class="property-group">
            <span class="property-label">Name</span>
            <span class="asset-value">${asset.name}</span>
          </div>

          <div class="property-group">
            <span class="property-label" title="Resource URL (res://)">Resource</span>
            <div class="asset-value-wrapper">
              <span class="asset-value asset-path">${resourceUrl}</span>
              <button
                class="btn-copy-resource"
                title="Copy Resource URL"
                @click=${() => this.handleCopyResourceUrl(resourceUrl)}
              >
                ${this.iconService.getIcon('copy', 14)}
              </button>
            </div>
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
        ${this.renderGroupsSection()} ${this.renderAnimationsSection()} ${this.renderScriptsSection()}
      </div>
    `;
  }

  private renderGroupsSection() {
    if (!this.primaryNode) return '';

    const groups = Array.from(this.primaryNode.groups).sort((a, b) => a.localeCompare(b));
    return html`
      <div class="property-group-section groups-section">
        <h4 class="group-title">Groups</h4>
        <div class="group-chip-list">
          ${groups.length === 0
        ? html`<div class="groups-empty">No groups assigned</div>`
        : groups.map(
          group => html`
                  <span class="group-chip">
                    ${group}
                    <button
                      class="group-chip-remove"
                      title="Remove from group"
                      @click=${() => this.removeFromGroup(group)}
                    >
                      ×
                    </button>
                  </span>
                `
        )}
        </div>
        <div class="group-add-row">
          <input
            class="property-input property-input--text group-input"
            .value=${this.newGroupName}
            placeholder="group_name"
            @input=${(e: Event) => this.onGroupNameInput(e)}
            @keydown=${(e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          void this.addToGroup();
        }
      }}
          />
          <button class="btn-add-group" @click=${() => this.addToGroup()}>Add</button>
        </div>
        ${this.newGroupError ? html`<div class="groups-error">${this.newGroupError}</div>` : ''}
      </div>
    `;
  }

  private renderAnimationsSection() {
    if (!(this.primaryNode instanceof MeshInstance)) return '';
    const clips = this.primaryNode.animations;
    if (clips.length === 0) return '';
    const initialAnimation = this.primaryNode.initialAnimation;

    return html`
      <div class="property-group-section animations-section">
        <h4 class="group-title">Animations</h4>
        <div class="animation-list">
          ${clips.map(clip => {
      const isActive = this.activePreviewAnimation === clip.name;
      const isDefault = initialAnimation === clip.name;
      return html`
              <div class="animation-item ${isActive ? 'animation-item--active' : ''}">
                <button
                  class="animation-preview-btn"
                  @click=${() => this.toggleAnimation(clip.name)}
                  title=${isActive ? 'Stop preview animation' : 'Play preview animation'}
                >
                  <span class="animation-play-icon">${isActive ? '⏹' : '▶'}</span>
                  <span class="animation-name">${clip.name}</span>
                  <span class="animation-duration">${clip.duration.toFixed(2)}s</span>
                </button>
                <button
                  class="animation-default-btn ${isDefault ? 'animation-default-btn--active' : ''}"
                  @click=${() => this.setInitialAnimation(clip.name)}
                  title=${isDefault
          ? 'Default startup animation'
          : 'Set as default startup animation'}
                >
                  ${isDefault ? 'Default' : 'Set Default'}
                </button>
              </div>
            `;
    })}
        </div>
        <div class="animation-default-row">
          <button
            class="animation-default-clear"
            @click=${() => this.setInitialAnimation(null)}
            ?disabled=${initialAnimation === null}
            title="Clear default startup animation (fallback to first clip)"
          >
            Clear Default
          </button>
        </div>
      </div>
    `;
  }

  private setInitialAnimation(name: string | null): void {
    const value = name ?? '';
    void this.applyPropertyChange('initialAnimation', value);
  }

  private toggleAnimation(name: string) {
    if (!this.primaryNode) return;
    const next = this.activePreviewAnimation === name ? null : name;
    this.activePreviewAnimation = next;
    this.viewportService.setPreviewAnimation(this.primaryNode.nodeId, next);
  }

  private onGroupNameInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.newGroupName = input.value;
    this.newGroupError = null;
  }

  private async addToGroup(): Promise<void> {
    if (!this.primaryNode) {
      return;
    }

    const groupName = this.newGroupName.trim();
    if (!/^[A-Za-z0-9_]+$/.test(groupName)) {
      this.newGroupError = 'Use letters, numbers, and underscores only.';
      return;
    }

    const command = new AddNodeToGroupCommand({
      nodeId: this.primaryNode.nodeId,
      group: groupName,
    });
    const didMutate = await this.commandDispatcher.execute(command);
    if (!didMutate) {
      this.newGroupError = 'Group update failed. Check project/scene state and duplicate names.';
      return;
    }

    this.newGroupName = '';
    this.newGroupError = null;
  }

  private async removeFromGroup(group: string): Promise<void> {
    if (!this.primaryNode) {
      return;
    }
    const command = new RemoveNodeFromGroupCommand({
      nodeId: this.primaryNode.nodeId,
      group,
    });
    await this.commandDispatcher.execute(command);
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
      component => html`
              <div class="script-item component-item">
                <button
                  class="script-foldout-btn"
                  @click=${() => this.toggleComponentExpanded(component.id)}
                  title=${this.isComponentExpanded(component.id) ? 'Collapse' : 'Expand'}
                >
                  ${this.iconService.getIcon(
        this.isComponentExpanded(component.id) ? 'chevron-down' : 'chevron-right',
        14
      )}
                </button>
                <div class="script-icon">
                  ${this.iconService.getIcon(this.getComponentIconName(component.type), 16)}
                </div>
                <div class="script-info">
                  <div class="script-name">${component.type}</div>
                </div>
                <div class="script-actions">
                  <button
                    class="btn-icon"
                    @click=${() => this.onToggleComponent(component.id, !component.enabled)}
                    title=${component.enabled ? 'Disable' : 'Enable'}
                  >
                    ${this.iconService.getIcon(component.enabled ? 'check-circle' : 'circle', 16)}
                  </button>
                  <button
                    class="btn-icon"
                    @click=${() => this.onRemoveComponent(component.id)}
                    title="Remove"
                  >
                    ${this.iconService.getIcon('trash-2', 16)}
                  </button>
                </div>
              </div>
              ${this.renderComponentProperties(component)}
            `
    )}
          ${components.length === 0
        ? html`<div class="no-scripts">No components attached</div>`
        : ''}
        </div>
      </div>
    `;
  }

  private isComponentExpanded(componentId: string): boolean {
    return this.expandedComponentIds.includes(componentId);
  }

  private toggleComponentExpanded(componentId: string): void {
    if (this.isComponentExpanded(componentId)) {
      this.expandedComponentIds = this.expandedComponentIds.filter(id => id !== componentId);
      return;
    }
    this.expandedComponentIds = [...this.expandedComponentIds, componentId];
  }

  private renderComponentProperties(component: ScriptComponent) {
    if (!this.isComponentExpanded(component.id)) {
      return '';
    }

    const schema = this.scriptRegistry.getComponentPropertySchema(component.type);
    if (!schema || schema.properties.length === 0) {
      return html`<div class="script-props-empty">No editable properties</div>`;
    }

    const groupedProps = getPropertiesByGroup(schema);
    const sortedGroups = Array.from(groupedProps.entries()).sort(([groupA], [groupB]) =>
      groupA.localeCompare(groupB)
    );

    return html`
      <div class="script-props">
        ${sortedGroups.map(([groupName, props]) => {
      const groupDef = schema.groups?.[groupName];
      const label = groupDef?.label ?? groupName;
      const visibleProps = props.filter(prop => !prop.ui?.hidden);
      if (visibleProps.length === 0) {
        return '';
      }
      return html`
            <div class="script-prop-group">
              <div class="script-prop-group-title">${label}</div>
              ${visibleProps.map(prop => this.renderComponentPropertyInput(component, prop))}
            </div>
          `;
    })}
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

    // Special handling for Size group - render with reset/aspect ratio buttons
    if (groupName === 'Size') {
      return this.renderSizeGroup(label, visibleProps);
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

  private renderSizeGroup(label: string, props: PropertyDefinition[]) {
    if (!this.primaryNode) {
      return '';
    }

    const widthProp = props.find(p => p.name === 'width');
    const heightProp = props.find(p => p.name === 'height');

    if (!widthProp || !heightProp) {
      // Fallback to default rendering if missing props
      return html`
        <div class="property-group-section">
          <h4 class="group-title">${label}</h4>
          ${props.map(prop => this.renderPropertyInput(prop))}
        </div>
      `;
    }

    const widthState = this.propertyValues[widthProp.name];
    const heightState = this.propertyValues[heightProp.name];
    const readOnly = widthProp.ui?.readOnly;

    const width = widthState ? parseFloat(widthState.value) : 64;
    const height = heightState ? parseFloat(heightState.value) : 64;

    // For sprite nodes, get aspect ratio lock and texture aspect ratio
    const node = this.primaryNode;
    let aspectRatioLocked = false;
    let textureAspectRatio: number | null = null;

    if ('aspectRatioLocked' in node) {
      aspectRatioLocked = (node as any).aspectRatioLocked ?? false;
    }
    if ('textureAspectRatio' in node) {
      textureAspectRatio = (node as any).textureAspectRatio ?? null;
    }

    const hasOriginalRatio = textureAspectRatio !== null && textureAspectRatio > 0;

    const handleWidthChange = (newWidth: number) => {
      if (aspectRatioLocked && hasOriginalRatio) {
        const newHeight = newWidth / textureAspectRatio!;
        void Promise.all([
          this.applyPropertyChange(widthProp.name, newWidth),
          this.applyPropertyChange(heightProp.name, newHeight),
        ]);
      } else {
        void this.applyPropertyChange(widthProp.name, newWidth);
      }
    };

    const handleHeightChange = (newHeight: number) => {
      if (aspectRatioLocked && hasOriginalRatio) {
        const newWidth = newHeight * textureAspectRatio!;
        void Promise.all([
          this.applyPropertyChange(widthProp.name, newWidth),
          this.applyPropertyChange(heightProp.name, newHeight),
        ]);
      } else {
        void this.applyPropertyChange(heightProp.name, newHeight);
      }
    };

    const handleResetToOriginal = () => {
      if (hasOriginalRatio) {
        // Reset to original texture size (keeping aspect ratio with width = 64 as default)
        const defaultWidth = 64;
        const defaultHeight = defaultWidth / textureAspectRatio!;
        void Promise.all([
          this.applyPropertyChange(widthProp.name, defaultWidth),
          this.applyPropertyChange(heightProp.name, defaultHeight),
        ]);
      }
    };

    const handleToggleAspectRatio = () => {
      if ('aspectRatioLocked' in node) {
        const newLocked = !aspectRatioLocked;
        void this.applyPropertyChange('aspectRatioLocked', newLocked);
      }
    };

    return html`
      <div class="property-group-section size-section">
        <div class="size-group-header">
          <h4 class="group-title">${label}</h4>
          <div class="size-group-actions">
            ${hasOriginalRatio
        ? html`
                <button
                  class="size-reset-button"
                  title="Reset to original texture size (64px × ${(64 / textureAspectRatio!).toFixed(1)}px)"
                  @click=${handleResetToOriginal}
                >
                  🔗
                </button>
              `
        : ''}
            ${hasOriginalRatio
        ? html`
                <button
                  class="size-lock-button ${aspectRatioLocked ? 'locked' : ''}"
                  title=${aspectRatioLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                  @click=${handleToggleAspectRatio}
                >
                  ${aspectRatioLocked ? '🔒' : '🔓'}
                </button>
              `
        : ''}
          </div>
        </div>

        <div class="size-fields">
          <div class="size-field">
            <label class="size-field-label">Width</label>
            <input
              type="number"
              class="size-field-input"
              step=${widthProp.ui?.step ?? 1}
              .value=${width.toFixed(widthProp.ui?.precision ?? 0)}
              ?disabled=${readOnly}
              @change=${(e: Event) => handleWidthChange(parseFloat((e.target as HTMLInputElement).value))}
            />
            ${widthProp.ui?.unit ? html`<span class="size-field-unit">${widthProp.ui.unit}</span>` : ''}
          </div>

          <div class="size-field">
            <label class="size-field-label">Height</label>
            <input
              type="number"
              class="size-field-input"
              step=${heightProp.ui?.step ?? 1}
              .value=${height.toFixed(heightProp.ui?.precision ?? 0)}
              ?disabled=${readOnly}
              @change=${(e: Event) => handleHeightChange(parseFloat((e.target as HTMLInputElement).value))}
            />
            ${heightProp.ui?.unit ? html`<span class="size-field-unit">${heightProp.ui.unit}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  private getSelectOptions(prop: PropertyDefinition): SelectOption[] {
    const options = prop.ui?.options;
    if (!options) {
      return [];
    }

    if (Array.isArray(options)) {
      return options.map(option => ({
        value: String(option),
        label: String(option),
      }));
    }

    if (typeof options === 'object') {
      return Object.entries(options).map(([label, value]) => ({
        label,
        value: String(value),
      }));
    }

    return [];
  }

  private renderComponentPropertyInput(component: ScriptComponent, prop: PropertyDefinition) {
    const key = this.getComponentPropertyKey(component.id, prop.name);
    const state = this.componentPropertyValues[key];
    if (!state) {
      return '';
    }

    const label = prop.ui?.label || prop.name;
    const readOnly = prop.ui?.readOnly;

    if (prop.type === 'boolean') {
      return html`
        <div class="property-group component-property-group">
          <label class="property-label property-label--checkbox">
            <input
              type="checkbox"
              class="property-checkbox"
              .checked=${state.value === 'true'}
              ?disabled=${readOnly}
              @change=${(e: Event) =>
          this.applyComponentPropertyChange(
            component.id,
            prop,
            (e.target as HTMLInputElement).checked
          )}
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
        console.warn(`Failed to parse vector2 component value for ${prop.name}:`, state.value);
      }
      return html`
        <div class="property-group component-property-group">
          <span class="property-label">${label}</span>
          <pix3-vector2-editor
            .x=${value.x}
            .y=${value.y}
            step=${prop.ui?.step ?? 0.01}
            precision=${prop.ui?.precision ?? 2}
            ?disabled=${readOnly}
            @change=${(e: CustomEvent) =>
          this.applyComponentPropertyChange(component.id, prop, e.detail)}
          ></pix3-vector2-editor>
        </div>
      `;
    }

    if (prop.type === 'vector3') {
      let value = { x: 0, y: 0, z: 0 };
      try {
        value = typeof state.value === 'string' ? JSON.parse(state.value) : state.value;
      } catch {
        console.warn(`Failed to parse vector3 component value for ${prop.name}:`, state.value);
      }
      return html`
        <div class="property-group component-property-group">
          <span class="property-label">${label}</span>
          <pix3-vector3-editor
            .x=${value.x}
            .y=${value.y}
            .z=${value.z}
            step=${prop.ui?.step ?? 0.01}
            precision=${prop.ui?.precision ?? 2}
            ?disabled=${readOnly}
            @change=${(e: CustomEvent) =>
          this.applyComponentPropertyChange(component.id, prop, e.detail)}
          ></pix3-vector3-editor>
        </div>
      `;
    }

    if (prop.type === 'euler') {
      let value = { x: 0, y: 0, z: 0 };
      try {
        value = typeof state.value === 'string' ? JSON.parse(state.value) : state.value;
      } catch {
        console.warn(`Failed to parse euler component value for ${prop.name}:`, state.value);
      }
      return html`
        <div class="property-group component-property-group">
          <span class="property-label">${label}</span>
          <pix3-euler-editor
            .x=${value.x}
            .y=${value.y}
            .z=${value.z}
            step=${prop.ui?.step ?? 0.1}
            precision=${prop.ui?.precision ?? 1}
            ?disabled=${readOnly}
            @change=${(e: CustomEvent) =>
          this.applyComponentPropertyChange(component.id, prop, e.detail)}
          ></pix3-euler-editor>
        </div>
      `;
    }

    if (prop.type === 'node') {
      const activeScene = this.sceneManager.getActiveSceneGraph();
      if (!activeScene) {
        return html`<div class="property-group component-property-group"><span class="property-label">${label}</span><span class="error-text">No active scene</span></div>`;
      }

      const allowedTypes = prop.ui?.nodeTypes;
      const nodes = Array.from(activeScene.nodeMap.values()).filter(n => {
        if (!allowedTypes || allowedTypes.length === 0) return true;
        return allowedTypes.includes(n.type);
      });

      return html`
        <div class="property-group component-property-group">
          <span class="property-label">${label}</span>
          <select
            class="property-select"
            .value=${state.value || ''}
            ?disabled=${readOnly}
            @change=${(e: Event) =>
          this.applyComponentPropertyChange(
            component.id,
            prop,
            (e.target as HTMLSelectElement).value
          )}
          >
            <option value="">[None]</option>
            ${nodes.map(n => html`<option value=${n.nodeId}>${n.name} (${n.type})</option>`)}
          </select>
        </div>
      `;
    }

    if (prop.type === 'select' || prop.type === 'enum') {
      const options = this.getSelectOptions(prop);
      return html`
        <div class="property-group component-property-group">
          <span class="property-label">${label}</span>
          <select
            class="property-select"
            .value=${state.value}
            ?disabled=${readOnly}
            @change=${(e: Event) =>
          this.applyComponentPropertyChange(
            component.id,
            prop,
            (e.target as HTMLSelectElement).value
          )}
          >
            ${options.map(option => html`<option value=${option.value}>${option.label}</option>`)}
          </select>
        </div>
      `;
    }

    if (prop.type === 'number') {
      return html`
        <div class="property-group component-property-group">
          <span class="property-label">${label}${prop.ui?.unit ? ` (${prop.ui.unit})` : ''}</span>
          <input
            type="number"
            step=${prop.ui?.step ?? 0.01}
            class="property-input property-input--number ${state.isValid
          ? ''
          : 'property-input--invalid'}"
            .value=${state.value}
            ?disabled=${readOnly}
            @input=${(e: Event) => this.handleComponentPropertyInput(component.id, prop, e)}
            @blur=${(e: Event) => this.handleComponentPropertyBlur(component.id, prop, e)}
          />
        </div>
      `;
    }

    return html`
      <div class="property-group component-property-group">
        <span class="property-label">${label}</span>
        <input
          type="text"
          class="property-input property-input--text"
          .value=${state.value}
          ?disabled=${readOnly}
          @input=${(e: Event) => this.handleComponentPropertyInput(component.id, prop, e)}
          @blur=${(e: Event) => this.handleComponentPropertyBlur(component.id, prop, e)}
        />
      </div>
    `;
  }

  private renderPropertyInput(prop: PropertyDefinition) {
    if (!this.primaryNode || !this.propertyValues[prop.name]) {
      return '';
    }

    const state = this.propertyValues[prop.name];
    const label = prop.ui?.label || prop.name;
    const readOnly = prop.ui?.readOnly;
    const isOverridden = this.isPropertyOverriddenForPrimaryNode(prop);
    const labelTemplate = this.renderPropertyLabel(prop, label, isOverridden);

    if (prop.type === 'object' && prop.ui?.editor === 'texture-resource') {
      const textureValue = this.toTextureResourceValue(state.value);
      const previewUrl = this.getTexturePreviewUrl(textureValue.url);

      return html`
        <div class="property-group">
          ${labelTemplate}
          <pix3-texture-resource-editor
            .resourceUrl=${textureValue.url}
            .previewUrl=${previewUrl}
            ?disabled=${readOnly}
            @change=${(event: CustomEvent<{ url: string }>) =>
              this.applyPropertyChange(prop.name, {
                type: 'texture',
                url: event.detail.url.trim(),
              })}
            @texture-drop=${(event: CustomEvent<{ event: DragEvent }>) =>
              this.onTextureResourceDrop(prop.name, event.detail.event)}
          ></pix3-texture-resource-editor>
        </div>
      `;
    }

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
            <span class=${isOverridden ? 'property-label--overridden' : ''}>${label}</span>
            ${isOverridden
        ? html`
                  <button
                    class="property-revert-button"
                    type="button"
                    title="Revert prefab override"
                    @click=${(e: Event) => this.onRevertPropertyClick(e, prop)}
                  >
                    ↺
                  </button>
                `
        : null}
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
          ${labelTemplate}
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
          ${labelTemplate}
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
          ${labelTemplate}
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

    if (prop.type === 'number' && (prop.ui as any)?.editor === 'sprite-size') {
      // Only render size editor for width property to avoid duplicates
      if (prop.name !== 'width') {
        return '';
      }

      // Handle sprite size editor (combines width and height)
      const heightState = this.propertyValues['height'];
      const widthVal = state.value;
      const heightVal = heightState?.value ?? 64;

      const node = this.primaryNode;
      const originalWidth = (node as any)?.originalWidth ?? null;
      const originalHeight = (node as any)?.originalHeight ?? null;
      const aspectRatioLocked = (node as any)?.aspectRatioLocked ?? false;
      const hasOriginalSize = originalWidth && originalHeight;

      return html`
        <div class="property-group">
          ${this.renderPropertyLabel(prop, 'Size', isOverridden)}
          <pix3-size-editor
            .width=${widthVal}
            .height=${heightVal}
            .aspectRatioLocked=${aspectRatioLocked}
            .hasOriginalSize=${hasOriginalSize}
            .originalWidth=${originalWidth}
            .originalHeight=${originalHeight}
            ?disabled=${readOnly}
            @change=${(e: CustomEvent<{ width: number; height: number; aspectRatioLocked: boolean }>) => {
              const { width, height, aspectRatioLocked } = e.detail;
              this.applyPropertyChange('width', width);
              this.applyPropertyChange('height', height);
              this.applyPropertyChange('aspectRatioLocked', aspectRatioLocked);
            }}
            @reset-size=${() => this.handleSizeReset()}
          ></pix3-size-editor>
        </div>
      `;
    }

    if (prop.type === 'node') {
      const activeScene = this.sceneManager.getActiveSceneGraph();
      if (!activeScene) {
        return html`<div class="property-group"><span class="property-label">${label}</span><span class="error-text">No active scene</span></div>`;
      }

      const allowedTypes = prop.ui?.nodeTypes;
      const nodes = Array.from(activeScene.nodeMap.values()).filter(n => {
        if (!allowedTypes || allowedTypes.length === 0) return true;
        return allowedTypes.includes(n.type);
      });

      return html`
        <div class="property-group">
          ${labelTemplate}
          <select
            class="property-select"
            .value=${state.value || ''}
            ?disabled=${readOnly}
            @change=${(e: Event) =>
          this.applyPropertyChange(prop.name, (e.target as HTMLSelectElement).value)}
          >
            <option value="">[None]</option>
            ${nodes.map(n => html`<option value=${n.nodeId}>${n.name} (${n.type})</option>`)}
          </select>
        </div>
      `;
    }

    if (prop.type === 'select' || prop.type === 'enum') {
      const options = this.getSelectOptions(prop);
      return html`
        <div class="property-group">
          ${labelTemplate}
          <select
            class="property-select"
            .value=${state.value}
            ?disabled=${readOnly}
            @change=${(e: Event) =>
          this.applyPropertyChange(prop.name, (e.target as HTMLSelectElement).value)}
          >
            ${options.map(option => html`<option value=${option.value}>${option.label}</option>`)}
          </select>
        </div>
      `;
    }

    if (prop.type === 'number') {
      return html`
        <div class="property-group">
          ${this.renderPropertyLabel(
        prop,
        `${label}${prop.ui?.unit ? ` (${prop.ui.unit})` : ''}`,
        isOverridden
      )}
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
            <span class=${isOverridden ? 'property-label--overridden' : ''}>${label}:</span>
            ${isOverridden
        ? html`
                  <button
                    class="property-revert-button"
                    type="button"
                    title="Revert prefab override"
                    @click=${(e: Event) => this.onRevertPropertyClick(e, prop)}
                  >
                    ↺
                  </button>
                `
        : null}
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
          <span class=${isOverridden ? 'property-label--overridden' : ''}>${label}:</span>
          ${isOverridden
      ? html`
                <button
                  class="property-revert-button"
                  type="button"
                  title="Revert prefab override"
                  @click=${(e: Event) => this.onRevertPropertyClick(e, prop)}
                >
                  ↺
                </button>
              `
      : null}
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

  private renderPropertyLabel(prop: PropertyDefinition, label: string, isOverridden: boolean) {
    return html`
      <span class="property-label ${isOverridden ? 'property-label--overridden' : ''}">
        ${label}
        ${isOverridden
          ? html`
              <button
                class="property-revert-button"
                type="button"
                title="Revert prefab override"
                @click=${(e: Event) => this.onRevertPropertyClick(e, prop)}
              >
                ↺
              </button>
            `
          : null}
      </span>
    `;
  }

  private onRevertPropertyClick(event: Event, prop: PropertyDefinition): void {
    event.stopPropagation();
    event.preventDefault();
    const baseValue = this.getPrefabBaseValueForProperty(prop);
    if (baseValue === undefined) {
      return;
    }
    void this.applyPropertyChange(prop.name, baseValue);
  }

  private isPropertyOverriddenForPrimaryNode(prop: PropertyDefinition): boolean {
    if (!this.primaryNode) {
      return false;
    }
    const baseValue = this.getPrefabBaseValueForProperty(prop);
    if (baseValue === undefined) {
      return false;
    }
    const currentValue = prop.getValue(this.primaryNode);
    return JSON.stringify(currentValue) !== JSON.stringify(baseValue);
  }

  private getPrefabBaseValueForProperty(prop: PropertyDefinition): unknown {
    if (!this.primaryNode) {
      return undefined;
    }

    const nodeMarker = getPrefabMetadata(this.primaryNode);
    if (!nodeMarker) {
      return undefined;
    }

    const instanceRoot = findPrefabInstanceRoot(this.primaryNode);
    if (!instanceRoot) {
      return undefined;
    }

    const rootMarker: PrefabMetadata | null = getPrefabMetadata(instanceRoot);
    const baseMap = rootMarker?.basePropertiesByLocalId;
    if (!baseMap) {
      return undefined;
    }

    const baseValue = baseMap[nodeMarker.effectiveLocalId]?.[prop.name];
    return baseValue === undefined ? undefined : JSON.parse(JSON.stringify(baseValue));
  }

  private async handleSizeReset() {
    if (!this.primaryNode) {
      return;
    }

    const originalWidth = (this.primaryNode as any).originalWidth ?? null;
    const originalHeight = (this.primaryNode as any).originalHeight ?? null;

    console.log(`[Inspector] Attempting size reset for "${this.primaryNode.name}"`, {
      originalWidth,
      originalHeight,
      nodeWidth: (this.primaryNode as any).width,
      nodeHeight: (this.primaryNode as any).height,
    });

    if (originalWidth && originalHeight) {
      console.log(`[Inspector] Applying reset: ${originalWidth}x${originalHeight}`);
      // Apply width first, then height. Sequential awaits to ensure they don't fight.
      await this.applyPropertyChange('width', originalWidth);
      await this.applyPropertyChange('height', originalHeight);
    } else {
      console.warn(`[Inspector] Cannot reset size: original dimensions unknown or invalid`, { originalWidth, originalHeight });
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-inspector-panel': InspectorPanel;
  }
}
