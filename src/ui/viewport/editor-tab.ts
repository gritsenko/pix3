import { ComponentBase, customElement, html, inject, property, state, css, unsafeCSS } from '@/fw';
import { subscribe } from 'valtio/vanilla';
import { appState, type EditorCameraProjection, type NavigationMode } from '@/state';
import styles from './editor-tab.ts.css?raw';
import dropdownButtonStyles from '@/ui/shared/pix3-dropdown-button.ts.css?raw';
import visibilityPopoverStyles from './viewport-visibility-popover.ts.css?raw';
import { ViewportRendererService, type TransformMode } from '@/services/ViewportRenderService';
import { CommandDispatcher } from '@/services/CommandDispatcher';
import { IconService } from '@/services/IconService';
import { Navigation2DController } from '@/services/Navigation2DController';
import { SceneManager, Camera3D, NodeBase } from '@pix3/runtime';
import { selectObject } from '@/features/selection/SelectObjectCommand';
import { toggleNavigationMode } from '@/features/viewport/ToggleNavigationModeCommand';
import { setEditorCameraProjection } from '@/features/viewport/SetEditorCameraProjectionCommand';
import { setPreviewCamera } from '@/features/viewport/SetPreviewCameraCommand';
import { renderViewportToolbar } from './viewport-toolbar';
import '../shared/pix3-dropdown-button';
import './viewport-visibility-popover';

@customElement('pix3-editor-tab')
export class EditorTabComponent extends ComponentBase {
  static useShadowDom = true;

  @inject(ViewportRendererService)
  private readonly viewportRenderer!: ViewportRendererService;

  @inject(CommandDispatcher)
  private readonly commandDispatcher!: CommandDispatcher;

  @inject(IconService)
  private readonly iconService!: IconService;

  @inject(Navigation2DController)
  private readonly navigation2D!: Navigation2DController;

  @inject(SceneManager)
  private readonly sceneManager!: SceneManager;

  @property({ type: String, reflect: true, attribute: 'tab-id' })
  tabId: string = '';

  @state()
  private transformMode: TransformMode = 'select';

  @state()
  private showGrid = false;

  @state()
  private showLayer2D = false;

  @state()
  private showLayer3D = false;

  @state()
  private showLighting = false;

  @state()
  private navigationMode: NavigationMode = '3d';

  @state()
  private editorCameraProjection: EditorCameraProjection = 'perspective';

  private canvasHost?: HTMLElement;
  private disposeUiSubscription?: () => void;
  private disposeTabsSubscription?: () => void;
  private disposeScenesSubscription?: () => void;
  private pointerDownPos?: { x: number; y: number };
  private pointerDownTime?: number;
  private isDragging = false;
  private touchGestureInProgress = false;
  private singleTouchPanPointerId: number | null = null;
  private readonly dragThreshold = 5;
  private wheelCanvas?: HTMLCanvasElement;

  private readonly resizeObserver = new ResizeObserver(entries => {
    const entry = entries[0];
    if (!entry) return;
    const { width, height } = entry.contentRect;
    if (width <= 0 || height <= 0) return;
    this.viewportRenderer.resize(width, height);
  });

  connectedCallback(): void {
    super.connectedCallback();

    // Initialize state from current appState values
    this.showGrid = appState.ui.showGrid;
    this.showLayer2D = appState.ui.showLayer2D;
    this.showLayer3D = appState.ui.showLayer3D;
    this.showLighting = appState.ui.showLighting;
    this.navigationMode = appState.ui.navigationMode;
    this.editorCameraProjection = appState.ui.editorCameraProjection;

    this.disposeUiSubscription = subscribe(appState.ui, () => {
      this.showGrid = appState.ui.showGrid;
      this.showLayer2D = appState.ui.showLayer2D;
      this.showLayer3D = appState.ui.showLayer3D;
      this.showLighting = appState.ui.showLighting;
      this.navigationMode = appState.ui.navigationMode;
      this.editorCameraProjection = appState.ui.editorCameraProjection;
      this.requestUpdate();
    });

    this.disposeTabsSubscription = subscribe(appState.tabs, () => {
      this.syncActiveState();
    });

    this.disposeScenesSubscription = subscribe(appState.scenes, () => {
      this.requestUpdate();
    });

    this.addEventListener('wheel', this.handleWheel as EventListener, {
      passive: false,
      capture: true,
    });
    this.addEventListener('pointerdown', this.handleCanvasPointerDown);
    this.addEventListener('pointermove', this.handleCanvasPointerMove);
    this.addEventListener('pointerup', this.handleCanvasPointerUp);
    this.addEventListener('pointercancel', this.handleCanvasPointerCancel);

    // Re-observe canvas host if it exists (handles reconnection/reparenting by Golden Layout)
    if (this.canvasHost) {
      try {
        this.resizeObserver.observe(this.canvasHost);
      } catch {
        // ignore
      }
    }

    this.syncActiveState();
  }

  disconnectedCallback(): void {
    this.resizeObserver.disconnect();
    this.disposeUiSubscription?.();
    this.disposeUiSubscription = undefined;
    this.disposeTabsSubscription?.();
    this.disposeTabsSubscription = undefined;
    this.disposeScenesSubscription?.();
    this.disposeScenesSubscription = undefined;
    this.removeEventListener('wheel', this.handleWheel as EventListener, true);
    this.renderRoot.removeEventListener('wheel', this.handleWheel as EventListener, true);
    this.wheelCanvas?.removeEventListener('wheel', this.handleWheel as EventListener, true);
    this.wheelCanvas = undefined;
    this.removeEventListener('pointerdown', this.handleCanvasPointerDown);
    this.removeEventListener('pointermove', this.handleCanvasPointerMove);
    this.removeEventListener('pointerup', this.handleCanvasPointerUp);
    this.removeEventListener('pointercancel', this.handleCanvasPointerCancel);
    this.navigation2D.clearTouchState();
    this.singleTouchPanPointerId = null;
    super.disconnectedCallback();
  }

  protected firstUpdated(): void {
    this.canvasHost = this.renderRoot.querySelector<HTMLElement>('.viewport-host') ?? undefined;
    if (this.canvasHost) {
      try {
        this.resizeObserver.observe(this.canvasHost);
      } catch {
        // ignore
      }
    }
    // Ensure wheel events are captured inside the shadow root.
    this.renderRoot.addEventListener('wheel', this.handleWheel as EventListener, {
      passive: false,
      capture: true,
    });
    this.syncActiveState();
  }

  protected render() {
    const tab = appState.tabs.tabs.find(t => t.id === this.tabId);
    const isSceneTab = tab?.type === 'scene';
    const {
      items: previewCameraItems,
      label: previewCameraLabel,
      isActive: isPreviewCameraActive,
    } = this.getPreviewCameraDropdownState();

    return html`
      <section
        class="panel"
        role="region"
        aria-label="Editor tab"
        tabindex="0"
        data-nav-mode="${this.navigationMode}"
      >
        <div class="viewport-toolbar-shell">
          ${renderViewportToolbar(
            {
              transformMode: isSceneTab ? this.transformMode : null,
              showGrid: this.showGrid,
              showLighting: this.showLighting,
              navigationMode: this.navigationMode,
              showLayer3D: this.showLayer3D,
              showLayer2D: this.showLayer2D,
              previewCameraLabel,
              previewCameraItems,
              isPreviewCameraActive,
              editorCameraProjection: this.editorCameraProjection,
            },
            {
              onTransformModeChange: m => this.handleTransformModeChange(m),
              onToggleNavigationMode: () => this.toggleNavigationMode(),
              onZoomDefault: () => this.zoomDefault(),
              onZoomAll: () => this.zoomAll(),
              onSelectPreviewCamera: itemId => this.handlePreviewCameraSelect(itemId),
              onToggleGrid: () => this.toggleGrid(),
              onToggleLighting: () => this.toggleLighting(),
              onToggleLayer3D: () => this.toggleLayer3D(),
              onToggleLayer2D: () => this.toggleLayer2D(),
              onSetEditorCameraProjection: projection => this.setEditorCameraProjection(projection),
            },
            this.iconService
          )}
        </div>

        <div class="viewport-host" part="canvas-host"></div>
      </section>
    `;
  }

  private syncActiveState(): void {
    if (!this.tabId) return;
    if (appState.tabs.activeTabId !== this.tabId) return;
    if (!this.canvasHost) return;

    this.viewportRenderer.attachToHost(this.canvasHost);

    // Bind wheel listener to the actual renderer canvas (it is moved between hosts).
    const canvas = this.viewportRenderer.getCanvasElement();
    if (canvas && canvas !== this.wheelCanvas) {
      this.wheelCanvas?.removeEventListener('wheel', this.handleWheel as EventListener, true);
      this.wheelCanvas = canvas;
      this.wheelCanvas.addEventListener('wheel', this.handleWheel as EventListener, {
        passive: false,
        capture: true,
      });
    }

    const rect = this.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      // Account for toolbar height by measuring host.
      const hostRect = this.canvasHost.getBoundingClientRect();
      if (hostRect.width > 0 && hostRect.height > 0) {
        this.viewportRenderer.resize(hostRect.width, hostRect.height);
      } else {
        this.viewportRenderer.resize(rect.width, rect.height);
      }
    }
  }

  private handleTransformModeChange(mode: TransformMode): void {
    this.transformMode = mode;
    this.viewportRenderer.setTransformMode(mode);
  }

  private toggleGrid(): void {
    void this.commandDispatcher.executeById('view.toggle-grid');
  }

  private toggleLayer2D(): void {
    void this.commandDispatcher.executeById('view.toggle-layer-2d');
  }

  private toggleLayer3D(): void {
    void this.commandDispatcher.executeById('view.toggle-layer-3d');
  }

  private toggleLighting(): void {
    void this.commandDispatcher.executeById('view.toggle-lighting');
  }

  private toggleNavigationMode(): void {
    const command = toggleNavigationMode();
    this.commandDispatcher.execute(command);
  }

  private zoomDefault(): void {
    void this.commandDispatcher.executeById('view.zoom-default');
  }

  private handlePreviewCameraSelect(itemId: string): void {
    const cameraNodeId = itemId === 'hide' ? null : itemId;
    void this.commandDispatcher.execute(setPreviewCamera(cameraNodeId)).then(() => {
      this.viewportRenderer.updateSelection();
      this.viewportRenderer.requestRender();
    });
  }

  private setEditorCameraProjection(projection: EditorCameraProjection): void {
    void this.commandDispatcher.execute(setEditorCameraProjection(projection)).then(() => {
      this.viewportRenderer.requestRender();
    });
  }

  private getPreviewCameraDropdownState(): {
    items: Array<{ id: string; label: string }>;
    label: string;
    isActive: boolean;
  } {
    const activeSceneId = appState.scenes.activeSceneId;
    const selectedCameraNodeId = activeSceneId
      ? (appState.scenes.previewCameraNodeIds[activeSceneId] ?? null)
      : null;
    const items = [{ id: 'hide', label: selectedCameraNodeId === null ? 'Hide (Active)' : 'Hide' }];

    if (!activeSceneId) {
      return {
        items,
        label: 'Hide',
        isActive: false,
      };
    }

    const sceneGraph = this.sceneManager.getSceneGraph(activeSceneId);
    if (!sceneGraph) {
      return {
        items,
        label: 'Hide',
        isActive: false,
      };
    }

    const cameras = this.collectCameraNodes(sceneGraph.rootNodes);
    for (const camera of cameras) {
      const cameraLabel = camera.name || camera.nodeId;
      items.push({
        id: camera.nodeId,
        label: camera.nodeId === selectedCameraNodeId ? `${cameraLabel} (Active)` : cameraLabel,
      });
    }

    const selectedCamera = selectedCameraNodeId
      ? (cameras.find(camera => camera.nodeId === selectedCameraNodeId) ?? null)
      : null;

    return {
      items,
      label: selectedCamera?.name || 'Hide',
      isActive: selectedCamera !== null,
    };
  }

  private collectCameraNodes(nodes: NodeBase[]): Camera3D[] {
    const cameras: Camera3D[] = [];

    for (const node of nodes) {
      if (node instanceof Camera3D) {
        cameras.push(node);
      }

      if (node.children.length > 0) {
        cameras.push(...this.collectCameraNodes(node.children));
      }
    }

    return cameras;
  }

  private zoomAll(): void {
    void this.commandDispatcher.executeById('view.zoom-all');
  }

  private handleWheel = (event: WheelEvent): void => {
    if (appState.tabs.activeTabId !== this.tabId) {
      return;
    }
    this.navigation2D.handleWheel(event);
  };

  private handleCanvasPointerDown = (event: PointerEvent): void => {
    if (appState.tabs.activeTabId !== this.tabId) return;

    const isToolbar = event
      .composedPath()
      .some(
        el =>
          el instanceof HTMLElement &&
          (el.classList.contains('top-toolbar') || el.classList.contains('toolbar-button'))
      );
    if (isToolbar) return;

    const canvas = this.viewportRenderer.getCanvasElement();
    const rect = canvas?.getBoundingClientRect() ?? this.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const handleType = this.viewportRenderer.get2DHandleAt?.(screenX, screenY) ?? 'idle';
    const shouldStartSingleTouchPan =
      event.pointerType === 'touch' &&
      this.shouldStartSingleTouchPan(handleType, screenX, screenY, canvas, rect);

    if (event.pointerType === 'touch' && appState.ui.navigationMode === '2d') {
      this.capturePointerSafely(event.pointerId);

      if (
        this.singleTouchPanPointerId !== null &&
        this.singleTouchPanPointerId !== event.pointerId
      ) {
        this.navigation2D.endPan();
        this.singleTouchPanPointerId = null;
      }

      if (!this.viewportRenderer.has2DTransform?.()) {
        this.navigation2D.startTouchPointer(event.pointerId, screenX, screenY);
      }

      if (this.navigation2D.isTouchGestureActive()) {
        this.navigation2D.endPan();
        this.singleTouchPanPointerId = null;
        this.touchGestureInProgress = true;
        this.clearPointerInteraction();
        this.isDragging = true;
        return;
      }
    }

    // Handle right-click pan in 2D mode
    if (event.button === 2 && appState.ui.navigationMode === '2d') {
      this.navigation2D.startPan(event.pointerId, screenX, screenY);
      this.isDragging = true;
      return;
    }

    if (handleType && handleType !== 'idle') {
      this.viewportRenderer.start2DTransform?.(screenX, screenY, handleType);
      this.pointerDownPos = { x: event.clientX, y: event.clientY };
      this.pointerDownTime = Date.now();
      this.isDragging = true;
      return;
    }

    if (shouldStartSingleTouchPan) {
      this.navigation2D.startPan(event.pointerId, screenX, screenY);
      this.singleTouchPanPointerId = event.pointerId;
    } else if (event.pointerType === 'touch') {
      this.singleTouchPanPointerId = null;
    }

    this.pointerDownPos = { x: event.clientX, y: event.clientY };
    this.pointerDownTime = Date.now();
    this.isDragging = false;
  };

  private handleCanvasPointerMove = (event: PointerEvent): void => {
    if (appState.tabs.activeTabId !== this.tabId) return;

    const canvas = this.viewportRenderer.getCanvasElement();
    const rect = canvas?.getBoundingClientRect() ?? this.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    if (
      event.pointerType === 'touch' &&
      appState.ui.navigationMode === '2d' &&
      this.navigation2D.isTouchPointerTracked(event.pointerId)
    ) {
      const didUpdateGesture = this.navigation2D.updateTouchPointer(
        event.pointerId,
        screenX,
        screenY
      );
      if (didUpdateGesture) {
        this.touchGestureInProgress = true;
        this.clearPointerInteraction();
        this.isDragging = true;
        return;
      }

      if (this.touchGestureInProgress || this.navigation2D.isTouchGestureActive()) {
        return;
      }
    }

    if (
      event.pointerType === 'touch' &&
      appState.ui.navigationMode === '2d' &&
      this.singleTouchPanPointerId === event.pointerId
    ) {
      const dx = event.clientX - (this.pointerDownPos?.x ?? event.clientX);
      const dy = event.clientY - (this.pointerDownPos?.y ?? event.clientY);
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > this.dragThreshold) {
        this.navigation2D.updateTouchPan(screenX, screenY);
        this.isDragging = true;
      }
      return;
    }

    // Handle right-click pan in 2D mode
    if (event.buttons === 2 && appState.ui.navigationMode === '2d') {
      this.navigation2D.updatePan(screenX, screenY);
      this.isDragging = true;
      return;
    }

    if (!this.pointerDownPos || !this.pointerDownTime) {
      this.viewportRenderer.updateHandleHover?.(screenX, screenY);
      this.viewportRenderer.update2DHoverPreview?.(screenX, screenY);
      return;
    }

    const has2DTransform = this.viewportRenderer.has2DTransform?.();
    if (has2DTransform) {
      this.viewportRenderer.update2DTransform?.(screenX, screenY, {
        preserveAspectRatio: event.shiftKey,
        constrainMoveToAxis: event.shiftKey,
      });
      this.isDragging = true;
      return;
    }

    const dx = event.clientX - this.pointerDownPos.x;
    const dy = event.clientY - this.pointerDownPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > this.dragThreshold) {
      this.isDragging = true;
    }
  };

  private handleCanvasPointerUp = (event: PointerEvent): void => {
    if (appState.tabs.activeTabId !== this.tabId) return;

    if (event.pointerType === 'touch') {
      this.releasePointerSafely(event.pointerId);

      if (this.singleTouchPanPointerId === event.pointerId) {
        this.navigation2D.endPan();
        this.singleTouchPanPointerId = null;
      }

      const touchGestureWasActive =
        this.touchGestureInProgress || this.navigation2D.isTouchGestureActive();
      const hadTrackedTouch = this.navigation2D.endTouchPointer(event.pointerId);

      if (touchGestureWasActive) {
        this.clearPointerInteraction();
        this.touchGestureInProgress = this.navigation2D.isTouchGestureActive();
        return;
      }

      if (hadTrackedTouch && this.navigation2D.isTouchGestureActive()) {
        this.touchGestureInProgress = true;
        this.clearPointerInteraction();
        return;
      }
    }

    // End right-click pan if active
    if (event.button === 2 && appState.ui.navigationMode === '2d') {
      this.navigation2D.endPan();
    }

    const isToolbar = event
      .composedPath()
      .some(
        el =>
          el instanceof HTMLElement &&
          (el.classList.contains('top-toolbar') || el.classList.contains('toolbar-button'))
      );
    if (isToolbar) {
      this.pointerDownPos = undefined;
      this.pointerDownTime = undefined;
      this.isDragging = false;
      return;
    }

    const has2DTransform = this.viewportRenderer.has2DTransform?.();
    if (has2DTransform) {
      this.viewportRenderer.complete2DTransform?.();
      this.pointerDownPos = undefined;
      this.pointerDownTime = undefined;
      this.isDragging = false;
      return;
    }

    const canvas = this.viewportRenderer.getCanvasElement();
    if (!canvas) {
      this.pointerDownPos = undefined;
      this.pointerDownTime = undefined;
      this.isDragging = false;
      return;
    }

    if (!this.isDragging) {
      const rect = canvas.getBoundingClientRect();
      const canvasWidth = rect.width;
      const canvasHeight = rect.height;
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const normalizedX = pointerX / canvasWidth;
      const normalizedY = pointerY / canvasHeight;

      const hitNode = this.viewportRenderer.raycastObject(normalizedX, normalizedY);
      if (hitNode) {
        const command = selectObject(hitNode.nodeId);
        this.commandDispatcher.execute(command);
      } else {
        const command = selectObject(null);
        this.commandDispatcher.execute(command);
      }
    }

    this.pointerDownPos = undefined;
    this.pointerDownTime = undefined;
    this.isDragging = false;
  };

  private handleCanvasPointerCancel = (event: PointerEvent): void => {
    if (appState.tabs.activeTabId !== this.tabId) return;

    if (event.pointerType === 'touch') {
      this.releasePointerSafely(event.pointerId);
      if (this.singleTouchPanPointerId === event.pointerId) {
        this.navigation2D.endPan();
        this.singleTouchPanPointerId = null;
      }
      this.navigation2D.endTouchPointer(event.pointerId);
      this.touchGestureInProgress = this.navigation2D.isTouchGestureActive();
    }

    if (event.button === 2 && appState.ui.navigationMode === '2d') {
      this.navigation2D.endPan();
    }

    this.clearPointerInteraction();
  };

  private clearPointerInteraction(): void {
    this.pointerDownPos = undefined;
    this.pointerDownTime = undefined;
    this.isDragging = false;
  }

  private shouldStartSingleTouchPan(
    handleType: string,
    screenX: number,
    screenY: number,
    canvas: HTMLCanvasElement | undefined,
    rect: DOMRect
  ): boolean {
    if (appState.ui.navigationMode !== '2d' || handleType !== 'idle') {
      return false;
    }

    if (appState.selection.nodeIds.length === 0) {
      return true;
    }

    if (!canvas || rect.width <= 0 || rect.height <= 0) {
      return false;
    }

    const hitNode = this.viewportRenderer.raycastObject(
      screenX / rect.width,
      screenY / rect.height
    );
    return !hitNode;
  }

  private capturePointerSafely(pointerId: number): void {
    try {
      this.setPointerCapture(pointerId);
    } catch {
      // Ignore browsers that reject capture during synthetic or retargeted events.
    }
  }

  private releasePointerSafely(pointerId: number): void {
    try {
      if (this.hasPointerCapture(pointerId)) {
        this.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore capture cleanup failures.
    }
  }

  static styles = css`
    ${unsafeCSS(styles)}
    ${unsafeCSS(dropdownButtonStyles)}
    ${unsafeCSS(visibilityPopoverStyles)}
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-editor-tab': EditorTabComponent;
  }
}
