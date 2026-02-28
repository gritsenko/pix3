import { ComponentBase, customElement, html, inject, property, state, css, unsafeCSS } from '@/fw';
import { subscribe } from 'valtio/vanilla';
import { appState, type NavigationMode } from '@/state';
import styles from './editor-tab.ts.css?raw';
import { ViewportRendererService, type TransformMode } from '@/services/ViewportRenderService';
import { CommandDispatcher } from '@/services/CommandDispatcher';
import { IconService } from '@/services/IconService';
import { Navigation2DController } from '@/services/Navigation2DController';
import { selectObject } from '@/features/selection/SelectObjectCommand';
import { toggleNavigationMode } from '@/features/viewport/ToggleNavigationModeCommand';
import renderTransformToolbar from './transform-toolbar';

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

  private canvasHost?: HTMLElement;
  private disposeUiSubscription?: () => void;
  private disposeTabsSubscription?: () => void;
  private pointerDownPos?: { x: number; y: number };
  private pointerDownTime?: number;
  private isDragging = false;
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

    this.disposeUiSubscription = subscribe(appState.ui, () => {
      this.showGrid = appState.ui.showGrid;
      this.showLayer2D = appState.ui.showLayer2D;
      this.showLayer3D = appState.ui.showLayer3D;
      this.showLighting = appState.ui.showLighting;
      this.navigationMode = appState.ui.navigationMode;
      this.requestUpdate();
    });

    this.disposeTabsSubscription = subscribe(appState.tabs, () => {
      this.syncActiveState();
    });

    this.addEventListener('wheel', this.handleWheel as EventListener, {
      passive: false,
      capture: true,
    });
    this.addEventListener('pointerdown', this.handleCanvasPointerDown);
    this.addEventListener('pointermove', this.handleCanvasPointerMove);
    this.addEventListener('pointerup', this.handleCanvasPointerUp);

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
    this.removeEventListener('wheel', this.handleWheel as EventListener, true);
    this.renderRoot.removeEventListener('wheel', this.handleWheel as EventListener, true);
    this.wheelCanvas?.removeEventListener('wheel', this.handleWheel as EventListener, true);
    this.wheelCanvas = undefined;
    this.removeEventListener('pointerdown', this.handleCanvasPointerDown);
    this.removeEventListener('pointermove', this.handleCanvasPointerMove);
    this.removeEventListener('pointerup', this.handleCanvasPointerUp);
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

    return html`
      <section
        class="panel"
        role="region"
        aria-label="Editor tab"
        tabindex="0"
        data-nav-mode="${this.navigationMode}"
      >
        <div
          class="top-toolbar"
          @click=${(e: Event) => e.stopPropagation()}
          @pointerdown=${(e: Event) => e.stopPropagation()}
          @pointerup=${(e: Event) => e.stopPropagation()}
        >
          ${isSceneTab
            ? renderTransformToolbar(
                this.transformMode,
                m => this.handleTransformModeChange(m),
                this.iconService
              )
            : null}
          <div class="toolbar-separator"></div>

          <button
            class="toolbar-button"
            aria-label="Toggle grid"
            aria-pressed="${this.showGrid}"
            @click="${(e: Event) => {
              e.stopPropagation();
              e.stopImmediatePropagation();
              this.toggleGrid();
            }}"
            title="Toggle Grid (G)"
          >
            <span class="toolbar-icon">${this.iconService.getIcon('grid')}</span>
          </button>
          <button
            class="toolbar-button"
            aria-label="Toggle lighting"
            aria-pressed="${this.showLighting}"
            @click="${(e: Event) => {
              e.stopPropagation();
              e.stopImmediatePropagation();
              this.toggleLighting();
            }}"
            title="Toggle Lighting (L)"
          >
            <span class="toolbar-icon">${this.iconService.getIcon('sun')}</span>
          </button>
          <button
            class="toolbar-button layer-toggle-button"
            aria-label="Toggle navigation mode"
            aria-pressed="${this.navigationMode === '2d'}"
            @click="${(e: Event) => {
              e.stopPropagation();
              e.stopImmediatePropagation();
              this.toggleNavigationMode();
            }}"
            title="Toggle Navigation Mode (N)"
          >
            <span class="layer-label">${this.navigationMode === '3d' ? '3D' : '2D'}</span>
          </button>
          <button
            class="toolbar-button layer-toggle-button"
            aria-label="Toggle 3D layer"
            aria-pressed="${this.showLayer3D}"
            @click="${(e: Event) => {
              e.stopPropagation();
              e.stopImmediatePropagation();
              this.toggleLayer3D();
            }}"
            title="Toggle 3D Layer (3)"
          >
            <span class="layer-label">3D</span>
          </button>
          <button
            class="toolbar-button layer-toggle-button"
            aria-label="Toggle 2D layer"
            aria-pressed="${this.showLayer2D}"
            @click="${(e: Event) => {
              e.stopPropagation();
              e.stopImmediatePropagation();
              this.toggleLayer2D();
            }}"
            title="Toggle 2D Layer (2)"
          >
            <span class="layer-label">2D</span>
          </button>

          <div class="toolbar-separator"></div>

          <button
            class="toolbar-button"
            aria-label="Zoom to default"
            @click="${(e: Event) => {
              e.stopPropagation();
              e.stopImmediatePropagation();
              this.zoomDefault();
            }}"
            title="Zoom Default (Home)"
          >
            <span class="toolbar-icon">${this.iconService.getIcon('zoom-default')}</span>
          </button>
          <button
            class="toolbar-button"
            aria-label="Zoom all"
            @click="${(e: Event) => {
              e.stopPropagation();
              e.stopImmediatePropagation();
              this.zoomAll();
            }}"
            title="Zoom All (F)"
          >
            <span class="toolbar-icon">${this.iconService.getIcon('zoom-all')}</span>
          </button>

          <div class="toolbar-spacer"></div>
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
    appState.ui.showGrid = !appState.ui.showGrid;
  }

  private toggleLayer2D(): void {
    appState.ui.showLayer2D = !appState.ui.showLayer2D;
  }

  private toggleLayer3D(): void {
    appState.ui.showLayer3D = !appState.ui.showLayer3D;
  }

  private toggleLighting(): void {
    appState.ui.showLighting = !appState.ui.showLighting;
  }

  private toggleNavigationMode(): void {
    const command = toggleNavigationMode();
    this.commandDispatcher.execute(command);
  }

  private zoomDefault(): void {
    this.viewportRenderer.zoomDefault();
  }

  private zoomAll(): void {
    this.viewportRenderer.zoomAll();
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

    // Handle right-click pan in 2D mode
    if (event.button === 2 && appState.ui.navigationMode === '2d') {
      const canvas = this.viewportRenderer.getCanvasElement();
      const rect = canvas?.getBoundingClientRect() ?? this.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      this.navigation2D.startPan(event.pointerId, screenX, screenY);
      this.isDragging = true;
      return;
    }

    const canvas = this.viewportRenderer.getCanvasElement();
    const rect = canvas?.getBoundingClientRect() ?? this.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    const handleType = this.viewportRenderer.get2DHandleAt?.(screenX, screenY);
    if (handleType && handleType !== 'idle') {
      this.viewportRenderer.start2DTransform?.(screenX, screenY, handleType);
      this.pointerDownPos = { x: event.clientX, y: event.clientY };
      this.pointerDownTime = Date.now();
      this.isDragging = true;
      return;
    }

    this.pointerDownPos = { x: event.clientX, y: event.clientY };
    this.pointerDownTime = Date.now();
    this.isDragging = false;
  };

  private handleCanvasPointerMove = (event: PointerEvent): void => {
    if (appState.tabs.activeTabId !== this.tabId) return;

    // Handle right-click pan in 2D mode
    if (event.buttons === 2 && appState.ui.navigationMode === '2d') {
      const canvas = this.viewportRenderer.getCanvasElement();
      const rect = canvas?.getBoundingClientRect() ?? this.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      this.navigation2D.updatePan(screenX, screenY);
      this.isDragging = true;
      return;
    }

    if (!this.pointerDownPos || !this.pointerDownTime) {
      const canvas = this.viewportRenderer.getCanvasElement();
      const rect = canvas?.getBoundingClientRect() ?? this.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      this.viewportRenderer.updateHandleHover?.(screenX, screenY);
      this.viewportRenderer.update2DHoverPreview?.(screenX, screenY);
      return;
    }

    const has2DTransform = this.viewportRenderer.has2DTransform?.();
    if (has2DTransform) {
      const canvas = this.viewportRenderer.getCanvasElement();
      const rect = canvas?.getBoundingClientRect() ?? this.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      this.viewportRenderer.update2DTransform?.(screenX, screenY);
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

  static styles = css`
    ${unsafeCSS(styles)}
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-editor-tab': EditorTabComponent;
  }
}
