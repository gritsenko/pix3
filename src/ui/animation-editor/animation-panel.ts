import { subscribe } from 'valtio/vanilla';

import { ComponentBase, customElement, html, inject, property, state } from '@/fw';
import { UpdateAnimationMetadataOperation } from '@/features/properties/UpdateAnimationMetadataOperation';
import { UpdateObjectPropertyCommand } from '@/features/properties/UpdateObjectPropertyCommand';
import { parseAnimationResourceText } from '@/features/scene/animation-asset-utils';
import { appState } from '@/state';
import {
  AnimationAutoSliceDialogService,
  CommandDispatcher,
  ProjectStorageService,
} from '@/services';
import { OperationService } from '@/services/OperationService';
import { AnimatedSprite2D, SceneManager, type AnimationFrame, type AnimationResource } from '@pix3/runtime';

import './animation-panel.ts.css';

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

@customElement('pix3-animation-panel')
export class AnimationPanel extends ComponentBase {
  @property({ type: String, reflect: true, attribute: 'tab-id' })
  tabId = '';

  @property({ type: String, attribute: 'resource-path' })
  resourcePath = '';

  @inject(SceneManager)
  private readonly sceneManager!: SceneManager;

  @inject(ProjectStorageService)
  private readonly projectStorage!: ProjectStorageService;

  @inject(OperationService)
  private readonly operations!: OperationService;

  @inject(CommandDispatcher)
  private readonly commandDispatcher!: CommandDispatcher;

  @inject(AnimationAutoSliceDialogService)
  private readonly animationAutoSliceDialogService!: AnimationAutoSliceDialogService;

  @state()
  private assetPath: string | null = null;

  @state()
  private resource: AnimationResource | null = null;

  @state()
  private activeClipName = '';

  @state()
  private texturePreviewUrl = '';

  @state()
  private errorMessage: string | null = null;

  @state()
  private slicerColumns = 1;

  @state()
  private slicerRows = 1;

  @state()
  private isTextureDragOver = false;

  private disposeTabsSubscription?: () => void;
  private disposeProjectSubscription?: () => void;
  private loadToken = 0;

  connectedCallback(): void {
    super.connectedCallback();
    this.disposeTabsSubscription = subscribe(appState.tabs, () => {
      void this.syncFromResourceContext(true);
    });
    this.disposeProjectSubscription = subscribe(appState.project, () => {
      const assetPath = this.resolveAssetPath();
      if (assetPath) {
        void this.loadResource(assetPath, true);
      }
    });
    void this.syncFromResourceContext(false);
  }

  protected updated(changedProperties: Map<PropertyKey, unknown>): void {
    if (changedProperties.has('tabId') || changedProperties.has('resourcePath')) {
      void this.syncFromResourceContext(false);
    }
  }

  disconnectedCallback(): void {
    this.disposeTabsSubscription?.();
    this.disposeProjectSubscription?.();
    this.disposeTabsSubscription = undefined;
    this.disposeProjectSubscription = undefined;
    this.revokeTexturePreviewUrl();
    super.disconnectedCallback();
  }

  protected render() {
    const activeClip = this.getActiveClip();
    const clipFrames = activeClip?.frames ?? [];

    return html`
      <section class="animation-editor" aria-label="Animation editor">
        ${this.errorMessage ? html`<div class="error-state">${this.errorMessage}</div>` : null}
        ${!this.assetPath && !this.errorMessage
          ? html`<div class="empty-state">
              Open a <code>.pix3anim</code> asset from the Asset Browser or double-click the
              animation resource field in the Inspector.
            </div>`
          : null}
        ${this.assetPath && this.resource
          ? html`
              <header class="editor-header">
                <div>
                  <div class="asset-kicker">Animation Asset</div>
                  <h2>${this.getAssetTitle()}</h2>
                  <div class="asset-path">${this.assetPath}</div>
                </div>
                <div class="header-meta">
                  <span>${this.resource.clips.length} clips</span>
                  <span>${clipFrames.length} frames in active clip</span>
                </div>
              </header>

              <div class="editor-body">
                <div class="animation-sidebar">
                  ${this.renderTextureSettings()}
                  ${this.renderClipList()}
                  ${this.renderClipSettings()}
                </div>

                <div class="animation-main">
                  <section class="panel-block panel-block--timeline">
                    <div class="timeline-header">
                      <div>
                        <h4>Timeline</h4>
                        <p class="panel-note">
                          ${activeClip
                            ? `Clip ${activeClip.name} at ${activeClip.fps} FPS${activeClip.loop ? ' looping' : ''}.`
                            : 'Select a clip to inspect its frame sequence.'}
                        </p>
                      </div>
                      <span class="timeline-meta">${clipFrames.length} frames</span>
                    </div>
                    ${activeClip
                      ? html`
                          <div class="clip-summary">
                            <span>Active Clip: ${activeClip.name}</span>
                            <span>${activeClip.loop ? 'Loop' : 'Play Once'}</span>
                          </div>
                        `
                      : null}
                    ${clipFrames.length > 0
                      ? html`
                          <div class="timeline">
                            ${clipFrames.map((frame, index) => this.renderFrameCard(frame, index))}
                          </div>
                        `
                      : html`
                          <div class="empty-state empty-state--inline">
                            This clip has no frames yet. Assign a spritesheet and use
                            <strong>Slice Frames...</strong>
                            to build the sequence in the slicer modal.
                          </div>
                        `}
                  </section>
                </div>
              </div>
            `
          : null}
      </section>
    `;
  }

  private renderClipList() {
    if (!this.resource) {
      return null;
    }

    return html`
      <section class="panel-block">
        <div class="section-header">
          <h4>Clips</h4>
          <div class="toolbar-row">
            <button class="primary-button" type="button" @click=${() => this.onAddClip()}>
              Add Clip
            </button>
            <button class="mini-button" type="button" @click=${() => this.onRemoveClip()}>
              Remove
            </button>
          </div>
        </div>
        <div class="clip-list">
          ${this.resource.clips.map(
            clip => html`
              <button
                class="clip-button ${clip.name === this.activeClipName ? 'is-active' : ''}"
                type="button"
                @click=${() => this.onSelectClip(clip.name)}
              >
                <span class="clip-button-label">${clip.name}</span>
                <span class="clip-button-meta">${clip.frames.length} frames</span>
              </button>
            `
          )}
        </div>
      </section>
    `;
  }

  private renderClipSettings() {
    const activeClip = this.getActiveClip();
    if (!activeClip) {
      return null;
    }

    return html`
      <section class="panel-block">
        <h4>Clip Settings</h4>
        <div class="field-grid">
          <label class="field">
            <span>Name</span>
            <input
              type="text"
              .value=${activeClip.name}
              @change=${(event: Event) =>
                this.onRenameClip((event.target as HTMLInputElement).value.trim())}
            />
          </label>
        </div>
        <div class="row">
          <label class="field">
            <span>FPS</span>
            <input
              type="number"
              min="1"
              step="1"
              .value=${String(activeClip.fps)}
              @change=${(event: Event) =>
                this.onUpdateClipFps(Number((event.target as HTMLInputElement).value))}
            />
          </label>
          <label class="field-toggle">
            <input
              type="checkbox"
              .checked=${activeClip.loop}
              @change=${(event: Event) =>
                this.onUpdateClipLoop((event.target as HTMLInputElement).checked)}
            />
            <span>Loop</span>
          </label>
        </div>
      </section>
    `;
  }

  private renderTextureSettings() {
    const texturePath = this.resource?.texturePath?.trim() ?? '';

    return html`
      <section class="panel-block">
        <h4>Spritesheet</h4>
        <div
          class="texture-drop-zone ${this.isTextureDragOver ? 'is-dragover' : ''}"
          @dragover=${(event: DragEvent) => this.onTextureDragOver(event)}
          @dragleave=${() => this.onTextureDragLeave()}
          @drop=${(event: DragEvent) => this.onTextureDrop(event)}
        >
          <span>
            ${texturePath
              ? 'Drop texture from Assets here to replace the spritesheet'
              : 'Drop texture from Assets here to set the spritesheet'}
          </span>
        </div>
        <label class="field">
          <span>Texture</span>
          <input
            type="text"
            .value=${texturePath}
            placeholder="res://textures/spritesheet.png"
            @change=${(event: Event) =>
              this.onUpdateTexturePath((event.target as HTMLInputElement).value.trim())}
          />
        </label>
        ${this.texturePreviewUrl
          ? html`
              <div class="texture-preview-card">
                <img src=${this.texturePreviewUrl} alt="Spritesheet preview" />
              </div>
            `
          : null}
        <div class="toolbar-row">
          <button
            class="primary-button"
            type="button"
            ?disabled=${texturePath.length === 0 || !this.activeClipName}
            @click=${() => this.openSlicerDialog(texturePath)}
          >
            Slice Frames...
          </button>
          <button
            class="mini-button"
            type="button"
            ?disabled=${texturePath.length === 0}
            @click=${() => this.onUpdateTexturePath('')}
          >
            Clear Texture
          </button>
        </div>
        <p class="panel-note">
          The slicer opens in a modal with a live preview of the spritesheet cut.
        </p>
      </section>
    `;
  }

  private renderFrameCard(frame: AnimationFrame, index: number) {
    const scaleX = frame.repeat.x > 0 ? 100 / frame.repeat.x : 100;
    const scaleY = frame.repeat.y > 0 ? 100 / frame.repeat.y : 100;
    const left = frame.repeat.x > 0 ? -(frame.offset.x / frame.repeat.x) * 100 : 0;
    const top = frame.repeat.y > 0 ? -(frame.offset.y / frame.repeat.y) * 100 : 0;

    return html`
      <div class="frame-card">
        <div class="frame-thumb">
          ${this.texturePreviewUrl
            ? html`
                <img
                  src=${this.texturePreviewUrl}
                  alt="Frame ${index + 1}"
                  style=${`width:${scaleX}%; height:${scaleY}%; left:${left}%; top:${top}%;`}
                />
              `
            : null}
        </div>
        <div class="frame-meta">Frame ${index + 1}</div>
        <div class="frame-meta">
          offset ${frame.offset.x.toFixed(3)}, ${frame.offset.y.toFixed(3)}
        </div>
      </div>
    `;
  }

  private getSelectedAnimatedSprite(): AnimatedSprite2D | null {
    const primaryNodeId = appState.selection.primaryNodeId;
    if (!primaryNodeId) {
      return null;
    }

    const graph = this.sceneManager.getActiveSceneGraph();
    const node = graph?.nodeMap.get(primaryNodeId);
    return node instanceof AnimatedSprite2D ? node : null;
  }

  private getActiveClip() {
    return this.resource?.clips.find(clip => clip.name === this.activeClipName) ?? null;
  }

  private hasSupportedImageExtension(path: string): boolean {
    const cleaned = path.split('?')[0].split('#')[0];
    const extension = cleaned.includes('.') ? (cleaned.split('.').pop()?.toLowerCase() ?? '') : '';
    return IMAGE_EXTENSIONS.has(extension);
  }

  private resolveAssetPath(): string | null {
    const directResourcePath = this.resourcePath.trim();
    if (directResourcePath) {
      return directResourcePath;
    }

    const tab = this.tabId
      ? appState.tabs.tabs.find(candidate => candidate.id === this.tabId && candidate.type === 'animation')
      : null;

    return tab?.resourceId ?? null;
  }

  private normalizeDroppedTextureResource(rawValue: string): string | null {
    const value = rawValue.trim();
    if (!value) {
      return null;
    }

    if (value.startsWith('res://') || value.startsWith('http://') || value.startsWith('https://')) {
      return this.hasSupportedImageExtension(value) ? value : null;
    }

    if (value.includes('://')) {
      return null;
    }

    const normalized = value.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\\+/g, '/');
    const resourcePath = `res://${normalized}`;
    return this.hasSupportedImageExtension(resourcePath) ? resourcePath : null;
  }

  private getDroppedTextureResource(event: DragEvent): string | null {
    const transfer = event.dataTransfer;
    if (!transfer) {
      return null;
    }

    return (
      this.normalizeDroppedTextureResource(transfer.getData(ASSET_RESOURCE_MIME)) ??
      this.normalizeDroppedTextureResource(transfer.getData(ASSET_PATH_MIME)) ??
      this.normalizeDroppedTextureResource(transfer.getData('text/uri-list')) ??
      this.normalizeDroppedTextureResource(transfer.getData('text/plain'))
    );
  }

  private async syncFromResourceContext(preserveClip: boolean): Promise<void> {
    const nextAssetPath = this.resolveAssetPath();
    const assetChanged = nextAssetPath !== this.assetPath;

    this.assetPath = nextAssetPath;
    await this.loadResource(nextAssetPath, preserveClip && !assetChanged);
  }

  private async loadResource(assetPath: string | null, preserveClip: boolean): Promise<void> {
    this.loadToken += 1;
    const token = this.loadToken;
    this.errorMessage = null;

    if (!assetPath) {
      this.resource = null;
      this.activeClipName = '';
      this.revokeTexturePreviewUrl();
      return;
    }

    try {
      const source = await this.projectStorage.readTextFile(assetPath);
      const resource = parseAnimationResourceText(source);
      if (token !== this.loadToken) {
        return;
      }

      this.resource = resource;
      const clipNames = new Set(resource.clips.map(clip => clip.name));
      const selectedSprite = this.getSelectedAnimatedSprite();
      const selectedClipName =
        selectedSprite?.animationResourcePath === assetPath ? selectedSprite.currentClip : '';
      const preferredClipName =
        preserveClip && clipNames.has(this.activeClipName)
          ? this.activeClipName
          : selectedClipName && clipNames.has(selectedClipName)
            ? selectedClipName
            : resource.clips[0]?.name ?? '';
      this.activeClipName = preferredClipName;

      await this.loadTexturePreview(resource.texturePath, token);
    } catch (error) {
      if (token !== this.loadToken) {
        return;
      }

      this.resource = null;
      this.activeClipName = '';
      this.revokeTexturePreviewUrl();
      this.errorMessage = error instanceof Error ? error.message : 'Failed to load animation asset.';
    }
  }

  private async loadTexturePreview(texturePath: string, token: number): Promise<void> {
    this.revokeTexturePreviewUrl();
    if (!texturePath) {
      return;
    }

    try {
      const blob = await this.projectStorage.readBlob(texturePath);
      if (token !== this.loadToken) {
        return;
      }

      this.texturePreviewUrl = URL.createObjectURL(blob);
    } catch {
      this.texturePreviewUrl = '';
    }
  }

  private revokeTexturePreviewUrl(): void {
    if (!this.texturePreviewUrl.startsWith('blob:')) {
      this.texturePreviewUrl = '';
      return;
    }

    URL.revokeObjectURL(this.texturePreviewUrl);
    this.texturePreviewUrl = '';
  }

  private async applyResourceUpdate(
    updater: (resource: AnimationResource) => AnimationResource,
    label: string,
    nextActiveClipName?: string
  ): Promise<boolean> {
    if (!this.assetPath || !this.resource) {
      return false;
    }

    const nextResource = updater(this.resource);
    const pushed = await this.operations.invokeAndPush(
      new UpdateAnimationMetadataOperation({
        animationResourcePath: this.assetPath,
        nextResource,
        label,
      })
    );
    if (!pushed) {
      return false;
    }

    const previousTexturePath = this.resource.texturePath;
    this.resource = nextResource;
    this.activeClipName = nextActiveClipName ?? nextResource.clips[0]?.name ?? '';

    if (previousTexturePath !== nextResource.texturePath) {
      const token = ++this.loadToken;
      await this.loadTexturePreview(nextResource.texturePath, token);
    }

    const selectedSprite = this.getSelectedAnimatedSprite();
    if (
      selectedSprite &&
      selectedSprite.animationResourcePath === this.assetPath &&
      this.activeClipName &&
      selectedSprite.currentClip !== this.activeClipName
    ) {
      await this.commandDispatcher.execute(
        new UpdateObjectPropertyCommand({
          nodeId: selectedSprite.nodeId,
          propertyPath: 'currentClip',
          value: this.activeClipName,
        })
      );
    }

    return true;
  }

  private async onSelectClip(clipName: string): Promise<void> {
    this.activeClipName = clipName;
    const selectedSprite = this.getSelectedAnimatedSprite();
    if (
      selectedSprite &&
      selectedSprite.animationResourcePath === this.assetPath &&
      selectedSprite.currentClip !== clipName
    ) {
      await this.commandDispatcher.execute(
        new UpdateObjectPropertyCommand({
          nodeId: selectedSprite.nodeId,
          propertyPath: 'currentClip',
          value: clipName,
        })
      );
    }
  }

  private async onAddClip(): Promise<void> {
    if (!this.resource) {
      return;
    }

    const existingNames = new Set(this.resource.clips.map(clip => clip.name));
    let index = this.resource.clips.length + 1;
    let nextName = `clip-${index}`;
    while (existingNames.has(nextName)) {
      index += 1;
      nextName = `clip-${index}`;
    }

    await this.applyResourceUpdate(
      resource => ({
        ...resource,
        clips: [
          ...resource.clips,
          {
            name: nextName,
            fps: 12,
            loop: true,
            frames: [],
          },
        ],
      }),
      `Add clip: ${nextName}`,
      nextName
    );
  }

  private async onRemoveClip(): Promise<void> {
    if (!this.resource || !this.activeClipName || this.resource.clips.length === 0) {
      return;
    }

    const remainingClips = this.resource.clips.filter(clip => clip.name !== this.activeClipName);
    const nextActiveClipName = remainingClips[0]?.name ?? '';

    await this.applyResourceUpdate(
      resource => ({
        ...resource,
        clips: resource.clips.filter(clip => clip.name !== this.activeClipName),
      }),
      `Remove clip: ${this.activeClipName}`,
      nextActiveClipName
    );
  }

  private async onRenameClip(nextName: string): Promise<void> {
    if (!this.resource || !this.activeClipName || !nextName) {
      return;
    }

    await this.applyResourceUpdate(
      resource => ({
        ...resource,
        clips: resource.clips.map(clip =>
          clip.name === this.activeClipName ? { ...clip, name: nextName } : clip
        ),
      }),
      `Rename clip: ${this.activeClipName} -> ${nextName}`,
      nextName
    );
  }

  private async onUpdateClipFps(nextFps: number): Promise<void> {
    if (!Number.isFinite(nextFps) || nextFps <= 0) {
      return;
    }

    await this.applyResourceUpdate(
      resource => ({
        ...resource,
        clips: resource.clips.map(clip =>
          clip.name === this.activeClipName ? { ...clip, fps: Math.round(nextFps) } : clip
        ),
      }),
      `Update clip fps: ${this.activeClipName}`
    );
  }

  private async onUpdateClipLoop(nextLoop: boolean): Promise<void> {
    await this.applyResourceUpdate(
      resource => ({
        ...resource,
        clips: resource.clips.map(clip =>
          clip.name === this.activeClipName ? { ...clip, loop: nextLoop } : clip
        ),
      }),
      `Update clip loop: ${this.activeClipName}`
    );
  }

  private hasAnyFrames(resource: AnimationResource): boolean {
    return resource.clips.some(clip => clip.frames.length > 0);
  }

  private async onAddFramesFromGrid(
    columns: number = this.slicerColumns,
    rows: number = this.slicerRows
  ): Promise<void> {
    const clip = this.getActiveClip();
    if (!clip || columns <= 0 || rows <= 0) {
      return;
    }

    const frameWidth = 1 / columns;
    const frameHeight = 1 / rows;
    const generatedFrames: AnimationFrame[] = [];

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        generatedFrames.push({
          textureIndex: 0,
          offset: {
            x: column * frameWidth,
            y: 1 - (row + 1) * frameHeight,
          },
          repeat: {
            x: frameWidth,
            y: frameHeight,
          },
        });
      }
    }

    await this.applyResourceUpdate(
      resource => ({
        ...resource,
        clips: resource.clips.map(existingClip =>
          existingClip.name === this.activeClipName
            ? { ...existingClip, frames: [...existingClip.frames, ...generatedFrames] }
            : existingClip
        ),
      }),
      `Slice spritesheet into ${generatedFrames.length} frames`
    );
  }

  private onTextureDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isTextureDragOver = true;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  private onTextureDragLeave(): void {
    this.isTextureDragOver = false;
  }

  private async onTextureDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.isTextureDragOver = false;

    const texturePath = this.getDroppedTextureResource(event);
    if (!texturePath) {
      return;
    }

    await this.onUpdateTexturePath(texturePath);
  }

  private async onUpdateTexturePath(nextTexturePath: string): Promise<void> {
    const trimmedTexturePath = nextTexturePath.trim();
    const shouldPromptForAutoSlice =
      Boolean(trimmedTexturePath) && Boolean(this.resource) && !this.hasAnyFrames(this.resource);

    const didMutate = await this.applyResourceUpdate(
      resource => ({
        ...resource,
        texturePath: trimmedTexturePath,
      }),
      trimmedTexturePath
        ? `Update spritesheet: ${trimmedTexturePath}`
        : 'Clear spritesheet texture'
    );

    if (!didMutate || !trimmedTexturePath || !shouldPromptForAutoSlice) {
      return;
    }

    await this.openSlicerDialog(trimmedTexturePath);
  }

  private async openSlicerDialog(texturePath: string): Promise<void> {
    const clipName = this.activeClipName || this.resource?.clips[0]?.name || 'idle';
    const result = await this.animationAutoSliceDialogService.showDialog({
      texturePath,
      clipName,
      defaultColumns: this.slicerColumns,
      defaultRows: this.slicerRows,
    });

    if (!result) {
      return;
    }

    this.slicerColumns = result.columns;
    this.slicerRows = result.rows;
    await this.onAddFramesFromGrid(result.columns, result.rows);
  }

  private getAssetTitle(): string {
    if (!this.assetPath) {
      return 'Animation';
    }

    const segments = this.assetPath.replace(/\\/g, '/').split('/').filter(Boolean);
    return segments[segments.length - 1] ?? this.assetPath;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-animation-panel': AnimationPanel;
  }
}