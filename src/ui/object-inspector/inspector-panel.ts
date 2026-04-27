import { ComponentBase, customElement, html, state, subscribe, inject } from '@/fw';
import {
  getNodePropertySchema,
  getPropertiesByGroup,
  getPropertyDisplayValue,
  Group2D,
  LAYOUT_PRESETS,
  type LayoutPreset,
  MeshInstance,
  Node2D,
  Sprite2D,
} from '@pix3/runtime';
import { SceneManager } from '@pix3/runtime';
import { appState } from '@/state';
import type { NodeBase, ScriptComponent } from '@pix3/runtime';
import type { PropertySchema, PropertyDefinition } from '@/fw';
import { UpdateObjectPropertyCommand } from '@/features/properties/UpdateObjectPropertyCommand';
import { UpdateSprite2DSizeCommand } from '@/features/properties/UpdateSprite2DSizeCommand';
import { CommandDispatcher } from '@/services/CommandDispatcher';
import { BehaviorPickerService } from '@/services/BehaviorPickerService';
import { ScriptCreatorService } from '@/services/ScriptCreatorService';
import { ScriptRegistry } from '@pix3/runtime';
import { IconService } from '@/services/IconService';
import { DialogService } from '@/services/DialogService';
import { FileSystemAPIService } from '@/services/FileSystemAPIService';
import { AssetsPreviewService, ProjectStorageService, type AssetPreviewItem } from '@/services';
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
import { analyzeAudioBlob } from '@/services/audio-preview-utils';

import '../shared/pix3-panel';
import './inspector-panel.ts.css';
import './model-asset-preview';
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

interface AudioPreviewState {
  readonly previewUrl: string;
  readonly waveformUrl: string;
  readonly durationSeconds: number | null;
  readonly channelCount: number | null;
  readonly sampleRate: number | null;
  readonly size: number;
}

interface TextAssetPreviewState {
  readonly content: string;
  readonly lineCount: number | null;
  readonly isLoading: boolean;
  readonly error: string | null;
}

type ReadOnlyValue = boolean | ((target: unknown) => boolean) | undefined;

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
const AUDIO_EXTENSIONS = new Set(['wav', 'mp3', 'ogg']);
const MODEL_EXTENSIONS = new Set(['glb', 'gltf']);

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

  @inject(ProjectStorageService)
  private readonly projectStorage!: ProjectStorageService;

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
  private readonly texturePreviewMetadata = new Map<
    string,
    { width: number; height: number; size: number }
  >();
  private readonly texturePreviewLoads = new Set<string>();
  private readonly audioPreviewUrls = new Map<string, string>();
  private readonly audioPreviewMetadata = new Map<
    string,
    {
      waveformUrl: string;
      durationSeconds: number | null;
      channelCount: number | null;
      sampleRate: number | null;
      size: number;
    }
  >();
  private readonly audioPreviewLoads = new Set<string>();
  private readonly textAssetPreviewContent = new Map<
    string,
    { content: string; lineCount: number; isTruncated: boolean }
  >();
  private readonly textAssetPreviewLoads = new Set<string>();
  private readonly textAssetPreviewErrors = new Map<string, string>();
  private readonly propertyPreviewStartValues = new Map<string, unknown>();
  private readonly componentPropertyPreviewStartValues = new Map<string, unknown>();

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
      if (snapshot.selectedItem?.previewType === 'model') {
        this.assetsPreviewService.requestThumbnail(snapshot.selectedItem.path);
      }
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
    this.texturePreviewMetadata.clear();
    this.texturePreviewLoads.clear();
    for (const previewUrl of this.audioPreviewUrls.values()) {
      URL.revokeObjectURL(previewUrl);
    }
    this.audioPreviewUrls.clear();
    this.audioPreviewMetadata.clear();
    this.audioPreviewLoads.clear();
    this.textAssetPreviewContent.clear();
    this.textAssetPreviewLoads.clear();
    this.textAssetPreviewErrors.clear();
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
    const previousPrimaryNodeId = this.primaryNode?.nodeId ?? null;
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

    const nextPrimaryNodeId = this.primaryNode?.nodeId ?? null;
    if (previousPrimaryNodeId !== nextPrimaryNodeId) {
      this.propertyPreviewStartValues.clear();
      this.componentPropertyPreviewStartValues.clear();
    }

    // Reset animation preview when selection changes
    const newPrimaryId = primaryNodeId ?? nodeIds[0] ?? null;
    if (previousPrimaryNodeId !== newPrimaryId && this.activePreviewAnimation !== null) {
      if (previousPrimaryNodeId) {
        this.viewportService.setPreviewAnimation(previousPrimaryNodeId, null);
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
      this.propertyPreviewStartValues.clear();
      this.componentPropertyPreviewStartValues.clear();
      return;
    }

    // Get the schema for this node
    this.propertySchema = getNodePropertySchema(this.primaryNode);
    this.newGroupError = null;

    // Initialize UI values from node properties
    const values: Record<string, PropertyUIState> = {};
    for (const prop of this.propertySchema.properties) {
      if (prop.ui?.hidden) {
        continue;
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
        if (prop.ui?.hidden) {
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

          // Get image dimensions
          const dimensions = await new Promise<{ width: number; height: number }>(resolve => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => resolve({ width: 0, height: 0 });
            img.src = objectUrl;
          });

          this.texturePreviewUrls.set(resourceUrl, objectUrl);
          this.texturePreviewMetadata.set(resourceUrl, {
            ...dimensions,
            size: blob.size,
          });
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
    return this.hasSupportedExtension(path, IMAGE_EXTENSIONS);
  }

  private getTextAssetPreview(assetPath: string, fallbackText: string | null): TextAssetPreviewState {
    const normalizedPath = assetPath.trim();
    if (!normalizedPath) {
      return {
        content: '',
        lineCount: null,
        isLoading: false,
        error: null,
      };
    }

    const cached = this.textAssetPreviewContent.get(normalizedPath);
    if (!cached && !this.textAssetPreviewLoads.has(normalizedPath)) {
      this.textAssetPreviewLoads.add(normalizedPath);
      void (async () => {
        try {
          const rawText = await this.projectStorage.readTextFile(normalizedPath);
          const normalizedText = rawText.replace(/\r\n/g, '\n');
          const lineCount = normalizedText.length === 0 ? 0 : normalizedText.split('\n').length;
          const maxLength = 24000;
          const isTruncated = normalizedText.length > maxLength;
          const content = isTruncated
            ? `${normalizedText.slice(0, maxLength)}\n\n... Preview truncated`
            : normalizedText;

          this.textAssetPreviewContent.set(normalizedPath, {
            content: content || 'Empty file',
            lineCount,
            isTruncated,
          });
          this.textAssetPreviewErrors.delete(normalizedPath);
        } catch (error) {
          this.textAssetPreviewErrors.set(
            normalizedPath,
            error instanceof Error ? error.message : 'Failed to load file content.'
          );
        } finally {
          this.textAssetPreviewLoads.delete(normalizedPath);
          this.requestUpdate();
        }
      })();
    }

    return {
      content: cached?.content ?? fallbackText ?? '',
      lineCount: cached?.lineCount ?? null,
      isLoading: this.textAssetPreviewLoads.has(normalizedPath),
      error: this.textAssetPreviewErrors.get(normalizedPath) ?? null,
    };
  }

  private getAudioPreview(resourceUrl: string): AudioPreviewState {
    const normalizedUrl = resourceUrl.trim();
    if (!normalizedUrl || !this.isAudioResource(normalizedUrl)) {
      return {
        previewUrl: '',
        waveformUrl: '',
        durationSeconds: null,
        channelCount: null,
        sampleRate: null,
        size: 0,
      };
    }

    const previewUrl =
      normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://')
        ? normalizedUrl
        : (this.audioPreviewUrls.get(normalizedUrl) ?? '');
    const metadata = this.audioPreviewMetadata.get(normalizedUrl);

    if (normalizedUrl.startsWith('res://') && !this.audioPreviewLoads.has(normalizedUrl)) {
      const hasLoadedPreview = previewUrl.length > 0 || metadata !== undefined;
      if (!hasLoadedPreview) {
        this.audioPreviewLoads.add(normalizedUrl);
        void (async () => {
          try {
            const blob = await this.fileSystemAPI.readBlob(normalizedUrl);
            const objectUrl = URL.createObjectURL(blob);
            const analysis = await analyzeAudioBlob(blob);

            this.audioPreviewUrls.set(normalizedUrl, objectUrl);
            this.audioPreviewMetadata.set(normalizedUrl, {
              waveformUrl: analysis.waveformUrl ?? '',
              durationSeconds: analysis.durationSeconds,
              channelCount: analysis.channelCount,
              sampleRate: analysis.sampleRate,
              size: blob.size,
            });
            this.requestUpdate();
          } catch {
            // Keep empty preview when read fails.
          } finally {
            this.audioPreviewLoads.delete(normalizedUrl);
          }
        })();
      }
    }

    return {
      previewUrl,
      waveformUrl: metadata?.waveformUrl ?? '',
      durationSeconds: metadata?.durationSeconds ?? null,
      channelCount: metadata?.channelCount ?? null,
      sampleRate: metadata?.sampleRate ?? null,
      size: metadata?.size ?? 0,
    };
  }

  private isAudioResource(path: string): boolean {
    return this.hasSupportedExtension(path, AUDIO_EXTENSIONS);
  }

  private isModelResource(path: string): boolean {
    return this.hasSupportedExtension(path, MODEL_EXTENSIONS);
  }

  private hasSupportedExtension(path: string, extensions: ReadonlySet<string>): boolean {
    const cleaned = path.split('?')[0].split('#')[0];
    const extension = cleaned.includes('.') ? (cleaned.split('.').pop()?.toLowerCase() ?? '') : '';
    return extensions.has(extension);
  }

  private normalizeDroppedResource(
    rawValue: string,
    isSupportedResource: (path: string) => boolean
  ): string | null {
    const value = rawValue.trim();
    if (!value) {
      return null;
    }

    if (value.startsWith('res://') || value.startsWith('http://') || value.startsWith('https://')) {
      return isSupportedResource(value) ? value : null;
    }

    if (value.includes('://')) {
      return null;
    }

    const normalized = value.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\\+/g, '/');
    const resourcePath = `res://${normalized}`;
    return isSupportedResource(resourcePath) ? resourcePath : null;
  }

  private getDroppedResource(
    event: DragEvent,
    isSupportedResource: (path: string) => boolean
  ): string | null {
    const transfer = event.dataTransfer;
    if (!transfer) {
      return null;
    }

    const fromResource = transfer.getData(ASSET_RESOURCE_MIME);
    const normalizedResource = this.normalizeDroppedResource(fromResource, isSupportedResource);
    if (normalizedResource) {
      return normalizedResource;
    }

    const fromPath = transfer.getData(ASSET_PATH_MIME);
    const normalizedPath = this.normalizeDroppedResource(fromPath, isSupportedResource);
    if (normalizedPath) {
      return normalizedPath;
    }

    const fromUriList = transfer.getData('text/uri-list');
    const normalizedUriList = this.normalizeDroppedResource(fromUriList, isSupportedResource);
    if (normalizedUriList) {
      return normalizedUriList;
    }

    const plain = transfer.getData('text/plain');
    return this.normalizeDroppedResource(plain, isSupportedResource);
  }

  private getDroppedTextureResource(event: DragEvent): string | null {
    return this.getDroppedResource(event, path => this.isImageResource(path));
  }

  private getDroppedAudioResource(event: DragEvent): string | null {
    return this.getDroppedResource(event, path => this.isAudioResource(path));
  }

  private getDroppedModelResource(event: DragEvent): string | null {
    return this.getDroppedResource(event, path => this.isModelResource(path));
  }

  private onTextureResourceDrop(propertyName: string, event: DragEvent): void {
    const textureUrl = this.getDroppedTextureResource(event);
    if (!textureUrl) {
      return;
    }

    void this.applyPropertyChange(propertyName, { type: 'texture', url: textureUrl });
  }

  private onAudioResourceDrop(propertyName: string, event: DragEvent): void {
    const audioUrl = this.getDroppedAudioResource(event);
    if (!audioUrl) {
      return;
    }

    void this.applyPropertyChange(propertyName, audioUrl);
  }

  private onModelResourceDrop(propertyName: string, event: DragEvent): void {
    const modelUrl = this.getDroppedModelResource(event);
    if (!modelUrl) {
      return;
    }

    void this.applyPropertyChange(propertyName, modelUrl);
  }

  private onComponentAudioResourceDrop(
    componentId: string,
    prop: PropertyDefinition,
    event: DragEvent
  ): void {
    const audioUrl = this.getDroppedAudioResource(event);
    if (!audioUrl) {
      return;
    }

    void this.applyComponentPropertyChange(componentId, prop, audioUrl);
  }

  private onComponentModelResourceDrop(
    componentId: string,
    prop: PropertyDefinition,
    event: DragEvent
  ): void {
    const modelUrl = this.getDroppedModelResource(event);
    if (!modelUrl) {
      return;
    }

    void this.applyComponentPropertyChange(componentId, prop, modelUrl);
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

    if (isValid) {
      await this.previewPropertyChange(propName, parsedValue);
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

    await this.commitPropertyChange(propName, value);
  }

  private normalizeColorValue(value: string): string | null {
    const normalized = value.trim().toLowerCase();
    const hexMatch = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!hexMatch) {
      return null;
    }

    const hex = hexMatch[1];
    if (hex.length === 3) {
      return `#${hex
        .split('')
        .map(char => `${char}${char}`)
        .join('')}`;
    }

    return `#${hex}`;
  }

  private getColorPickerValue(rawValue: string): string {
    return this.normalizeColorValue(rawValue) ?? '#ffffff';
  }

  private async handleColorPickerInput(propName: string, nextColor: string): Promise<void> {
    const normalized = this.normalizeColorValue(nextColor);
    if (!normalized) {
      return;
    }

    this.propertyValues = {
      ...this.propertyValues,
      [propName]: { value: normalized, isValid: true },
    };

    await this.previewPropertyChange(propName, normalized);
  }

  private async handleColorPickerCommit(propName: string, nextColor: string): Promise<void> {
    const normalized = this.normalizeColorValue(nextColor);
    if (!normalized) {
      return;
    }

    this.propertyValues = {
      ...this.propertyValues,
      [propName]: { value: normalized, isValid: true },
    };

    await this.commitPropertyChange(propName, normalized);
  }

  private async handleSliderPreview(propName: string, nextValue: number): Promise<void> {
    this.propertyValues = {
      ...this.propertyValues,
      [propName]: { value: String(nextValue), isValid: true },
    };

    await this.previewPropertyChange(propName, nextValue);
  }

  private async handleSliderCommit(propName: string, nextValue: number): Promise<void> {
    this.propertyValues = {
      ...this.propertyValues,
      [propName]: { value: String(nextValue), isValid: true },
    };

    await this.commitPropertyChange(propName, nextValue);
  }

  private async previewPropertyChange(propertyName: string, value: unknown): Promise<void> {
    if (!this.primaryNode || !this.propertySchema) {
      return;
    }

    const propDef = this.propertySchema.properties.find(p => p.name === propertyName);
    if (!propDef) {
      return;
    }

    if (!this.propertyPreviewStartValues.has(propertyName)) {
      this.propertyPreviewStartValues.set(propertyName, propDef.getValue(this.primaryNode));
    }

    const command = new UpdateObjectPropertyCommand({
      nodeId: this.primaryNode.nodeId,
      propertyPath: propertyName,
      value,
      historyMode: 'preview',
    });

    try {
      await this.commandDispatcher.execute(command);
    } catch (error) {
      console.error('[InspectorPanel] Failed to preview property', propertyName, error);
      const displayValue = getPropertyDisplayValue(this.primaryNode, propDef);
      this.propertyValues = {
        ...this.propertyValues,
        [propertyName]: { value: displayValue, isValid: true },
      };
      this.propertyPreviewStartValues.delete(propertyName);
    }
  }

  private async commitPropertyChange(propertyName: string, value: unknown): Promise<void> {
    if (!this.primaryNode || !this.propertySchema) {
      return;
    }

    const hasPreviousValueOverride = this.propertyPreviewStartValues.has(propertyName);
    const previousValue = this.propertyPreviewStartValues.get(propertyName);
    this.propertyPreviewStartValues.delete(propertyName);

    await this.applyPropertyChange(propertyName, value, previousValue, hasPreviousValueOverride);
  }

  private async applyPropertyChange(
    propertyName: string,
    value: unknown,
    previousValue?: unknown,
    hasPreviousValueOverride: boolean = false
  ) {
    if (!this.primaryNode || !this.propertySchema) return;

    // Find the property definition
    const propDef = this.propertySchema.properties.find(p => p.name === propertyName);
    if (!propDef) return;

    const command = new UpdateObjectPropertyCommand({
      nodeId: this.primaryNode.nodeId,
      propertyPath: propertyName,
      value,
      ...(hasPreviousValueOverride ? { previousValue } : {}),
      historyMode: 'commit',
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

  private async applySpriteSizeChange(
    width: number,
    height: number,
    aspectRatioLocked?: boolean
  ): Promise<void> {
    if (!(this.primaryNode instanceof Sprite2D)) {
      return;
    }

    const command = new UpdateSprite2DSizeCommand({
      nodeId: this.primaryNode.nodeId,
      width,
      height,
      aspectRatioLocked,
    });

    try {
      await this.commandDispatcher.execute(command);
    } catch (error) {
      console.error('[InspectorPanel] Failed to update Sprite2D size', error);
      this.syncValuesFromNode();
      this.requestUpdate();
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
      await this.previewComponentPropertyChange(componentId, prop, parsedValue);
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

    await this.commitComponentPropertyChange(componentId, prop, value);
  }

  private async previewComponentPropertyChange(
    componentId: string,
    propDef: PropertyDefinition,
    value: unknown
  ): Promise<void> {
    if (!this.primaryNode) return;

    const component = this.primaryNode.components.find(c => c.id === componentId);
    if (!component) {
      return;
    }

    const key = this.getComponentPropertyKey(componentId, propDef.name);
    if (!this.componentPropertyPreviewStartValues.has(key)) {
      this.componentPropertyPreviewStartValues.set(key, propDef.getValue(component));
    }

    const command = new UpdateComponentPropertyCommand({
      nodeId: this.primaryNode.nodeId,
      componentId,
      propertyName: propDef.name,
      value,
      historyMode: 'preview',
    });

    try {
      await this.commandDispatcher.execute(command);
    } catch (error) {
      console.error('[InspectorPanel] Failed to preview component property', propDef.name, error);
      this.componentPropertyValues = {
        ...this.componentPropertyValues,
        [key]: {
          value: this.getPropertyDisplayValue(component, propDef),
          isValid: true,
        },
      };
      this.componentPropertyPreviewStartValues.delete(key);
    }
  }

  private async commitComponentPropertyChange(
    componentId: string,
    propDef: PropertyDefinition,
    value: unknown
  ): Promise<void> {
    const key = this.getComponentPropertyKey(componentId, propDef.name);
    const hasPreviousValueOverride = this.componentPropertyPreviewStartValues.has(key);
    const previousValue = this.componentPropertyPreviewStartValues.get(key);
    this.componentPropertyPreviewStartValues.delete(key);

    await this.applyComponentPropertyChange(
      componentId,
      propDef,
      value,
      previousValue,
      hasPreviousValueOverride
    );
  }

  private async handleComponentSliderPreview(
    componentId: string,
    propDef: PropertyDefinition,
    nextValue: number
  ): Promise<void> {
    const key = this.getComponentPropertyKey(componentId, propDef.name);
    this.componentPropertyValues = {
      ...this.componentPropertyValues,
      [key]: { value: String(nextValue), isValid: true },
    };

    await this.previewComponentPropertyChange(componentId, propDef, nextValue);
  }

  private async handleComponentSliderCommit(
    componentId: string,
    propDef: PropertyDefinition,
    nextValue: number
  ): Promise<void> {
    const key = this.getComponentPropertyKey(componentId, propDef.name);
    this.componentPropertyValues = {
      ...this.componentPropertyValues,
      [key]: { value: String(nextValue), isValid: true },
    };

    await this.commitComponentPropertyChange(componentId, propDef, nextValue);
  }

  private async handleComponentColorPickerInput(
    componentId: string,
    propDef: PropertyDefinition,
    nextColor: string
  ): Promise<void> {
    const normalized = this.normalizeColorValue(nextColor);
    if (!normalized) {
      return;
    }

    const key = this.getComponentPropertyKey(componentId, propDef.name);
    this.componentPropertyValues = {
      ...this.componentPropertyValues,
      [key]: { value: normalized, isValid: true },
    };

    await this.previewComponentPropertyChange(componentId, propDef, normalized);
  }

  private async handleComponentColorPickerCommit(
    componentId: string,
    propDef: PropertyDefinition,
    nextColor: string
  ): Promise<void> {
    const normalized = this.normalizeColorValue(nextColor);
    if (!normalized) {
      return;
    }

    const key = this.getComponentPropertyKey(componentId, propDef.name);
    this.componentPropertyValues = {
      ...this.componentPropertyValues,
      [key]: { value: normalized, isValid: true },
    };

    await this.commitComponentPropertyChange(componentId, propDef, normalized);
  }

  private async applyComponentPropertyChange(
    componentId: string,
    propDef: PropertyDefinition,
    value: unknown,
    previousValue?: unknown,
    hasPreviousValueOverride: boolean = false
  ): Promise<void> {
    if (!this.primaryNode) return;

    const command = new UpdateComponentPropertyCommand({
      nodeId: this.primaryNode.nodeId,
      componentId,
      propertyName: propDef.name,
      value,
      ...(hasPreviousValueOverride ? { previousValue } : {}),
      historyMode: 'commit',
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
    const isModel = asset.previewType === 'model';
    const isAudio = asset.previewType === 'audio';
    const isText = asset.previewType === 'text';
    const textPreview = isText ? this.getTextAssetPreview(asset.path, asset.previewText) : null;
    const resourceUrl = asset.path === '.' ? 'res://' : `res://${asset.path}`;

    return html`
      <div class="property-section">
        <div class="section-header">
          <h3 class="section-title">Asset Inspector</h3>
          <p class="node-type">${asset.extension ? asset.extension.toUpperCase() : 'FILE'}</p>
        </div>

        <div class="property-group-section asset-section">
          <h4 class="group-title">Preview</h4>
          ${isModel
            ? html`
                <pix3-model-asset-preview
                  .resourcePath=${resourceUrl}
                  .assetName=${asset.name}
                  .fallbackImageUrl=${asset.thumbnailUrl ?? ''}
                  .thumbnailStatus=${asset.thumbnailStatus}
                ></pix3-model-asset-preview>
              `
            : isAudio
              ? html`
                  <pix3-audio-resource-editor
                    .resourceUrl=${resourceUrl}
                    .previewUrl=${asset.previewUrl ?? ''}
                    .waveformUrl=${asset.thumbnailUrl ?? ''}
                    .durationSeconds=${asset.durationSeconds ?? 0}
                    .channelCount=${asset.channelCount ?? 0}
                    .sampleRate=${asset.sampleRate ?? 0}
                    .fileSize=${asset.sizeBytes ?? 0}
                    .showResourceControls=${false}
                  ></pix3-audio-resource-editor>
                `
              : isText
                ? html`
                    <div class="asset-text-preview-shell">
                      ${textPreview?.isLoading && !textPreview.content
                        ? html`<div class="asset-text-preview-state">Loading content...</div>`
                        : textPreview?.error
                          ? html`<div class="asset-text-preview-state asset-text-preview-state--error">
                              ${textPreview.error}
                            </div>`
                          : html`<pre class="asset-text-preview">${textPreview?.content || 'Empty file'}</pre>`}
                    </div>
                  `
            : isImage
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
          ${isAudio && asset.durationSeconds !== null
            ? html`
                <div class="property-group">
                  <span class="property-label">Duration</span>
                  <span class="asset-value">${this.formatDuration(asset.durationSeconds)}</span>
                </div>
              `
            : ''}
          ${isAudio && asset.channelCount !== null
            ? html`
                <div class="property-group">
                  <span class="property-label">Channels</span>
                  <span class="asset-value">${asset.channelCount}</span>
                </div>
              `
            : ''}
          ${isAudio && asset.sampleRate !== null
            ? html`
                <div class="property-group">
                  <span class="property-label">Sample Rate</span>
                  <span class="asset-value">${this.formatSampleRate(asset.sampleRate)}</span>
                </div>
              `
            : ''}
          ${isText && textPreview !== null && textPreview.lineCount !== null
            ? html`
                <div class="property-group">
                  <span class="property-label">Lines</span>
                  <span class="asset-value">${textPreview.lineCount}</span>
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

  private formatDuration(durationSeconds: number | null): string {
    if (durationSeconds === null || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
      return '-';
    }

    const totalSeconds = Math.round(durationSeconds);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  private formatSampleRate(sampleRate: number | null): string {
    if (sampleRate === null || !Number.isFinite(sampleRate) || sampleRate <= 0) {
      return '-';
    }

    const khz = sampleRate / 1000;
    return `${khz % 1 === 0 ? khz.toFixed(0) : khz.toFixed(1)} kHz`;
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
          <p class="node-id">ID: ${this.primaryNode.nodeId}</p>
          ${this.selectedNodes.length > 1
            ? html`<p class="selection-info">${this.selectedNodes.length} objects selected</p>`
            : ''}
          <p class="node-type">${nodeType}</p>
        </div>

        ${sortedGroups.map(([groupName, props]) => this.renderPropertyGroup(groupName, props))}
        ${this.renderGroupsSection()} ${this.renderAnimationsSection()}
        ${this.renderScriptsSection()}
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

    // Special handling for Anchor group - compact toggle by default
    if (groupName === 'Anchor' && this.primaryNode instanceof Node2D) {
      return this.renderAnchorGroup(label, visibleProps);
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

  private renderAnchorGroup(label: string, props: PropertyDefinition[]) {
    if (!this.primaryNode || !(this.primaryNode instanceof Node2D)) {
      return '';
    }

    const enabled = this.propertyValues['layoutEnabled']?.value === 'true';
    const toggleDisabled = appState.collaboration.isReadOnly;
    const anchorProps = props.filter(prop => prop.name !== 'layoutEnabled');

    const toggleButton = html`
      <button
        class=${`anchor-toggle-button ${enabled ? 'is-active' : ''}`}
        type="button"
        title=${enabled ? 'Disable anchor layout' : 'Enable anchor layout'}
        aria-label=${enabled ? 'Disable anchor layout' : 'Enable anchor layout'}
        ?disabled=${toggleDisabled}
        @click=${() => this.applyPropertyChange('layoutEnabled', !enabled)}
      >
        ${this.iconService.getIcon('anchor', 14)}
        <span>Anchor</span>
      </button>
    `;

    if (!enabled) {
      return html`
        <div class="property-group-section anchor-section anchor-section--collapsed">
          <div class="anchor-toggle-row">${toggleButton}</div>
        </div>
      `;
    }

    return html`
      <div class="property-group-section anchor-section anchor-section--expanded">
        <div class="anchor-section-header">
          <h4 class="group-title">${label}</h4>
          ${toggleButton}
        </div>
        <div class="anchor-fields">${anchorProps.map(prop => this.renderPropertyInput(prop))}</div>
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
    if (appState.collaboration.isReadOnly) {
      return;
    }
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
    const readOnly = this.isPropertyReadOnly(prop.ui?.readOnly, this.primaryNode);

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
    const remainingProps = props.filter(p => p.name !== 'width' && p.name !== 'height');

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
    const readOnly = this.isPropertyReadOnly(widthProp.ui?.readOnly, this.primaryNode);

    const width = widthState ? parseFloat(widthState.value) : 64;
    const height = heightState ? parseFloat(heightState.value) : 64;

    if (!(this.primaryNode instanceof Sprite2D)) {
      return html`
        <div class="property-group-section">
          <h4 class="group-title">${label}</h4>
          ${props.map(prop => this.renderPropertyInput(prop))}
        </div>
      `;
    }

    const node = this.primaryNode;
    const aspectRatioLocked = node.aspectRatioLocked;
    const textureAspectRatio = node.textureAspectRatio;
    const originalWidth = node.originalWidth;
    const originalHeight = node.originalHeight;
    const hasOriginalRatio = textureAspectRatio !== null && textureAspectRatio > 0;
    const hasOriginalSize =
      typeof originalWidth === 'number' &&
      originalWidth > 0 &&
      typeof originalHeight === 'number' &&
      originalHeight > 0;

    const handleWidthChange = (newWidth: number) => {
      if (!Number.isFinite(newWidth) || newWidth <= 0) {
        return;
      }
      if (aspectRatioLocked && hasOriginalRatio) {
        const newHeight = newWidth / textureAspectRatio!;
        void this.applySpriteSizeChange(newWidth, newHeight, aspectRatioLocked);
      } else {
        void this.applySpriteSizeChange(newWidth, height, aspectRatioLocked);
      }
    };

    const handleHeightChange = (newHeight: number) => {
      if (!Number.isFinite(newHeight) || newHeight <= 0) {
        return;
      }
      if (aspectRatioLocked && hasOriginalRatio) {
        const newWidth = newHeight * textureAspectRatio!;
        void this.applySpriteSizeChange(newWidth, newHeight, aspectRatioLocked);
      } else {
        void this.applySpriteSizeChange(width, newHeight, aspectRatioLocked);
      }
    };

    const handleResetToOriginal = () => {
      if (hasOriginalSize) {
        void this.applySpriteSizeChange(originalWidth, originalHeight, aspectRatioLocked);
      }
    };

    const handleToggleAspectRatio = () => {
      const newLocked = !aspectRatioLocked;
      void this.applyPropertyChange('aspectRatioLocked', newLocked);
    };

    return html`
      <div class="property-group-section size-section">
        <div class="size-group-header">
          <h4 class="group-title">${label}</h4>
          <div class="size-group-actions">
            ${hasOriginalSize
              ? html`
                  <button
                    class="size-reset-button"
                    title=${`Reset to original texture size (${originalWidth} x ${originalHeight})`}
                    @click=${handleResetToOriginal}
                  >
                    ${this.iconService.getIcon('refresh-cw', 14)}
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
                    ${this.iconService.getIcon(aspectRatioLocked ? 'lock' : 'unlock', 14)}
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
              @change=${(e: Event) =>
                handleWidthChange(parseFloat((e.target as HTMLInputElement).value))}
            />
            ${widthProp.ui?.unit
              ? html`<span class="size-field-unit">${widthProp.ui.unit}</span>`
              : ''}
          </div>

          <div class="size-field">
            <label class="size-field-label">Height</label>
            <input
              type="number"
              class="size-field-input"
              step=${heightProp.ui?.step ?? 1}
              .value=${height.toFixed(heightProp.ui?.precision ?? 0)}
              ?disabled=${readOnly}
              @change=${(e: Event) =>
                handleHeightChange(parseFloat((e.target as HTMLInputElement).value))}
            />
            ${heightProp.ui?.unit
              ? html`<span class="size-field-unit">${heightProp.ui.unit}</span>`
              : ''}
          </div>
        </div>
        ${remainingProps.map(prop => this.renderPropertyInput(prop))}
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

  private isPropertyReadOnly(
    readOnly: ReadOnlyValue,
    target: NodeBase | ScriptComponent | null | undefined
  ): boolean {
    if (appState.collaboration.isReadOnly) {
      return true;
    }

    if (typeof readOnly === 'function') {
      return Boolean(target ? readOnly(target) : false);
    }

    return Boolean(readOnly);
  }

  private renderComponentPropertyInput(component: ScriptComponent, prop: PropertyDefinition) {
    const key = this.getComponentPropertyKey(component.id, prop.name);
    const state = this.componentPropertyValues[key];
    if (!state) {
      return '';
    }

    const label = prop.ui?.label || prop.name;
    const readOnly = this.isPropertyReadOnly(prop.ui?.readOnly, component);

    if (prop.type === 'string' && prop.ui?.editor === 'audio-resource') {
      const audioPreview = this.getAudioPreview(state.value);
      return html`
        <div class="property-group component-property-group">
          <span class="property-label">${label}</span>
          <pix3-audio-resource-editor
            .resourceUrl=${state.value}
            .previewUrl=${audioPreview.previewUrl}
            .waveformUrl=${audioPreview.waveformUrl}
            .durationSeconds=${audioPreview.durationSeconds ?? 0}
            .channelCount=${audioPreview.channelCount ?? 0}
            .sampleRate=${audioPreview.sampleRate ?? 0}
            .fileSize=${audioPreview.size}
            ?disabled=${readOnly}
            @change=${(event: CustomEvent<{ url: string }>) =>
              this.applyComponentPropertyChange(component.id, prop, event.detail.url.trim())}
            @audio-drop=${(event: CustomEvent<{ event: DragEvent }>) =>
              this.onComponentAudioResourceDrop(component.id, prop, event.detail.event)}
          ></pix3-audio-resource-editor>
        </div>
      `;
    }

    if (prop.type === 'string' && prop.ui?.editor === 'model-resource') {
      return html`
        <div class="property-group component-property-group">
          <span class="property-label">${label}</span>
          <pix3-model-resource-editor
            .resourceUrl=${state.value}
            ?disabled=${readOnly}
            @change=${(event: CustomEvent<{ url: string }>) =>
              this.applyComponentPropertyChange(component.id, prop, event.detail.url.trim())}
            @model-drop=${(event: CustomEvent<{ event: DragEvent }>) =>
              this.onComponentModelResourceDrop(component.id, prop, event.detail.event)}
          ></pix3-model-resource-editor>
        </div>
      `;
    }

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
        return html`<div class="property-group component-property-group">
          <span class="property-label">${label}</span
          ><span class="error-text">No active scene</span>
        </div>`;
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
            ?disabled=${readOnly}
            @change=${(e: Event) =>
              this.applyComponentPropertyChange(
                component.id,
                prop,
                (e.target as HTMLSelectElement).value
              )}
          >
            <option value="" ?selected=${!state.value}>[None]</option>
            ${nodes.map(
              n =>
                html`<option value=${n.nodeId} ?selected=${n.nodeId === state.value}>
                  ${n.name} (${n.type})
                </option>`
            )}
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
            ?disabled=${readOnly}
            @change=${(e: Event) =>
              this.applyComponentPropertyChange(
                component.id,
                prop,
                (e.target as HTMLSelectElement).value
              )}
          >
            ${options.map(
              option =>
                html`<option value=${option.value} ?selected=${option.value === state.value}>
                  ${option.label}
                </option>`
            )}
          </select>
        </div>
      `;
    }

    if (prop.type === 'number') {
      const hasSlider =
        prop.ui?.slider === true &&
        typeof prop.ui?.min === 'number' &&
        typeof prop.ui?.max === 'number' &&
        Number.isFinite(prop.ui.min) &&
        Number.isFinite(prop.ui.max);

      if (hasSlider) {
        const numericValue = Number.parseFloat(state.value);
        const safeValue = Number.isFinite(numericValue) ? numericValue : Number(prop.ui?.min);

        return html`
          <div class="property-group component-property-group">
            <span class="property-label">${label}${prop.ui?.unit ? ` (${prop.ui.unit})` : ''}</span>
            <pix3-slider-number-editor
              .value=${safeValue}
              .min=${Number(prop.ui?.min)}
              .max=${Number(prop.ui?.max)}
              .step=${prop.ui?.step ?? 0.01}
              .precision=${prop.ui?.precision ?? 2}
              ?disabled=${readOnly}
              @preview-change=${(e: CustomEvent<{ value: number }>) =>
                this.handleComponentSliderPreview(component.id, prop, e.detail.value)}
              @commit-change=${(e: CustomEvent<{ value: number }>) =>
                this.handleComponentSliderCommit(component.id, prop, e.detail.value)}
            ></pix3-slider-number-editor>
          </div>
        `;
      }

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

    if (prop.type === 'color') {
      const pickerValue = this.getColorPickerValue(state.value);

      return html`
        <div class="property-group component-property-group">
          <span class="property-label">${label}</span>
          <div class="property-color-editor">
            <input
              type="color"
              class="property-color-picker"
              .value=${pickerValue}
              ?disabled=${readOnly}
              @input=${(e: Event) =>
                this.handleComponentColorPickerInput(
                  component.id,
                  prop,
                  (e.target as HTMLInputElement).value
                )}
              @change=${async (e: Event) => {
                const input = e.target as HTMLInputElement;
                await this.handleComponentColorPickerCommit(component.id, prop, input.value);
                input.blur();
              }}
            />
            <input
              type="text"
              class="property-input property-input--text ${state.isValid
                ? ''
                : 'property-input--invalid'}"
              .value=${state.value}
              ?disabled=${readOnly}
              @input=${(e: Event) => this.handleComponentPropertyInput(component.id, prop, e)}
              @blur=${(e: Event) => this.handleComponentPropertyBlur(component.id, prop, e)}
            />
          </div>
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
    const readOnly = this.isPropertyReadOnly(prop.ui?.readOnly, this.primaryNode);
    const isOverridden = this.isPropertyOverriddenForPrimaryNode(prop);
    const labelTemplate = this.renderPropertyLabel(prop, label, isOverridden);

    if (prop.type === 'object' && prop.ui?.editor === 'texture-resource') {
      const textureValue = this.toTextureResourceValue(state.value);
      const previewUrl = this.getTexturePreviewUrl(textureValue.url);
      const metadata = this.texturePreviewMetadata.get(textureValue.url.trim());

      return html`
        <div class="property-group">
          ${labelTemplate}
          <pix3-texture-resource-editor
            .resourceUrl=${textureValue.url}
            .previewUrl=${previewUrl}
            .originalWidth=${metadata?.width ?? 0}
            .originalHeight=${metadata?.height ?? 0}
            .fileSize=${metadata?.size ?? 0}
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

    if (prop.type === 'string' && prop.ui?.editor === 'audio-resource') {
      const audioPreview = this.getAudioPreview(state.value);
      return html`
        <div class="property-group">
          ${labelTemplate}
          <pix3-audio-resource-editor
            .resourceUrl=${state.value}
            .previewUrl=${audioPreview.previewUrl}
            .waveformUrl=${audioPreview.waveformUrl}
            .durationSeconds=${audioPreview.durationSeconds ?? 0}
            .channelCount=${audioPreview.channelCount ?? 0}
            .sampleRate=${audioPreview.sampleRate ?? 0}
            .fileSize=${audioPreview.size}
            ?disabled=${readOnly}
            @change=${(event: CustomEvent<{ url: string }>) =>
              this.applyPropertyChange(prop.name, event.detail.url.trim())}
            @audio-drop=${(event: CustomEvent<{ event: DragEvent }>) =>
              this.onAudioResourceDrop(prop.name, event.detail.event)}
          ></pix3-audio-resource-editor>
        </div>
      `;
    }

    if (prop.type === 'string' && prop.ui?.editor === 'model-resource') {
      return html`
        <div class="property-group">
          ${labelTemplate}
          <pix3-model-resource-editor
            .resourceUrl=${state.value}
            ?disabled=${readOnly}
            @change=${(event: CustomEvent<{ url: string }>) =>
              this.applyPropertyChange(prop.name, event.detail.url.trim())}
            @model-drop=${(event: CustomEvent<{ event: DragEvent }>) =>
              this.onModelResourceDrop(prop.name, event.detail.event)}
          ></pix3-model-resource-editor>
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

    if (prop.type === 'number' && prop.ui?.editor === 'sprite-size') {
      // Only render size editor for width property to avoid duplicates
      if (prop.name !== 'width') {
        return '';
      }

      // Handle sprite size editor (combines width and height)
      const heightState = this.propertyValues['height'];
      const widthVal = Number.parseFloat(state.value);
      const heightVal = Number.parseFloat(heightState?.value ?? '64');

      const node = this.primaryNode instanceof Sprite2D ? this.primaryNode : null;
      const originalWidth = node?.originalWidth ?? null;
      const originalHeight = node?.originalHeight ?? null;
      const aspectRatioLocked = node?.aspectRatioLocked ?? false;
      const hasOriginalSize = Boolean(
        typeof originalWidth === 'number' &&
          originalWidth > 0 &&
          typeof originalHeight === 'number' &&
          originalHeight > 0
      );

      return html`
        <div class="property-group">
          ${this.renderPropertyLabel(prop, 'Size', isOverridden)}
          <pix3-size-editor
            .width=${Number.isFinite(widthVal) && widthVal > 0 ? widthVal : 64}
            .height=${Number.isFinite(heightVal) && heightVal > 0 ? heightVal : 64}
            .aspectRatioLocked=${aspectRatioLocked}
            .hasOriginalSize=${hasOriginalSize}
            .originalWidth=${originalWidth}
            .originalHeight=${originalHeight}
            ?disabled=${readOnly}
            @change=${(
              e: CustomEvent<{ width: number; height: number; aspectRatioLocked: boolean }>
            ) => {
              const { width, height, aspectRatioLocked } = e.detail;
              this.applySpriteSizeChange(width, height, aspectRatioLocked);
            }}
            @reset-size=${() => this.handleSizeReset()}
          ></pix3-size-editor>
        </div>
      `;
    }

    if (prop.type === 'node') {
      const activeScene = this.sceneManager.getActiveSceneGraph();
      if (!activeScene) {
        return html`<div class="property-group">
          <span class="property-label">${label}</span
          ><span class="error-text">No active scene</span>
        </div>`;
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
            ?disabled=${readOnly}
            @change=${(e: Event) =>
              this.applyPropertyChange(prop.name, (e.target as HTMLSelectElement).value)}
          >
            <option value="" ?selected=${!state.value}>[None]</option>
            ${nodes.map(
              n =>
                html`<option value=${n.nodeId} ?selected=${n.nodeId === state.value}>
                  ${n.name} (${n.type})
                </option>`
            )}
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
            ?disabled=${readOnly}
            @change=${(e: Event) =>
              this.applyPropertyChange(prop.name, (e.target as HTMLSelectElement).value)}
          >
            ${options.map(
              option =>
                html`<option value=${option.value} ?selected=${option.value === state.value}>
                  ${option.label}
                </option>`
            )}
          </select>
        </div>
      `;
    }

    if (prop.type === 'number') {
      const hasSlider =
        prop.ui?.slider === true &&
        typeof prop.ui?.min === 'number' &&
        typeof prop.ui?.max === 'number' &&
        Number.isFinite(prop.ui.min) &&
        Number.isFinite(prop.ui.max);

      if (hasSlider) {
        const numericValue = Number.parseFloat(state.value);
        const safeValue = Number.isFinite(numericValue) ? numericValue : Number(prop.ui?.min);

        return html`
          <div class="property-group">
            ${this.renderPropertyLabel(
              prop,
              `${label}${prop.ui?.unit ? ` (${prop.ui.unit})` : ''}`,
              isOverridden
            )}
            <pix3-slider-number-editor
              .value=${safeValue}
              .min=${Number(prop.ui?.min)}
              .max=${Number(prop.ui?.max)}
              .step=${prop.ui?.step ?? 0.01}
              .precision=${prop.ui?.precision ?? 2}
              ?disabled=${readOnly}
              @preview-change=${(e: CustomEvent<{ value: number }>) =>
                this.handleSliderPreview(prop.name, e.detail.value)}
              @commit-change=${(e: CustomEvent<{ value: number }>) =>
                this.handleSliderCommit(prop.name, e.detail.value)}
            ></pix3-slider-number-editor>
          </div>
        `;
      }

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

    if (prop.type === 'color') {
      const pickerValue = this.getColorPickerValue(state.value);

      return html`
        <div class="property-group">
          ${labelTemplate}
          <div class="property-color-editor">
            <input
              type="color"
              class="property-color-picker"
              .value=${pickerValue}
              ?disabled=${readOnly}
              @input=${(e: Event) =>
                this.handleColorPickerInput(prop.name, (e.target as HTMLInputElement).value)}
              @change=${async (e: Event) => {
                const input = e.target as HTMLInputElement;
                await this.handleColorPickerCommit(prop.name, input.value);
                input.blur();
              }}
            />
            <input
              type="text"
              class="property-input property-input--text ${state.isValid
                ? ''
                : 'property-input--invalid'}"
              .value=${state.value}
              ?disabled=${readOnly}
              @input=${(e: Event) => this.handlePropertyInput(prop.name, e)}
              @blur=${(e: Event) => this.handlePropertyBlur(prop.name, e)}
            />
          </div>
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
    if (!(this.primaryNode instanceof Sprite2D)) {
      return;
    }

    const originalWidth = this.primaryNode.originalWidth;
    const originalHeight = this.primaryNode.originalHeight;
    if (
      typeof originalWidth === 'number' &&
      originalWidth > 0 &&
      typeof originalHeight === 'number' &&
      originalHeight > 0
    ) {
      await this.applySpriteSizeChange(
        originalWidth,
        originalHeight,
        this.primaryNode.aspectRatioLocked
      );
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-inspector-panel': InspectorPanel;
  }
}
