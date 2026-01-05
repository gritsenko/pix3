import { ComponentBase, customElement, html, inject, property, state, css, unsafeCSS } from '@/fw';
import { subscribe } from 'valtio/vanilla';
import { appState } from '@/state';
import styles from './editor-tab.ts.css?raw';
import { ViewportRendererService, type TransformMode } from '@/services/ViewportRenderService';
import { CommandDispatcher } from '@/services/CommandDispatcher';
import { IconService } from '@/services/IconService';
import { selectObject } from '@/features/selection/SelectObjectCommand';
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

  private canvasHost?: HTMLElement;
  private disposeUiSubscription?: () => void;
  private disposeTabsSubscription?: () => void;
  private pointerDownPos?: { x: number; y: number };
  private pointerDownTime?: number;
  private isDragging = false;
  private readonly dragThreshold = 5;

  private readonly resizeObserver = new ResizeObserver(entries => {
    const entry = entries[0];
    if (!entry) return;
    const { width, height } = entry.contentRect;
    if (width <= 0 || height <= 0) return;
    this.viewportRenderer.resize(width, height);
  });

  connectedCallback(): void {
    super.connectedCallback();

    this.disposeUiSubscription = subscribe(appState.ui, () => {
      this.showGrid = appState.ui.showGrid;
      this.showLayer2D = appState.ui.showLayer2D;
      this.showLayer3D = appState.ui.showLayer3D;
      this.requestUpdate();
    });

    this.disposeTabsSubscription = subscribe(appState.tabs, () => {
      this.syncActiveState();
    });

    this.addEventListener('keydown', this.handleKeyDown);
    this.addEventListener('pointerdown', this.handleCanvasPointerDown);
    this.addEventListener('pointermove', this.handleCanvasPointerMove);
    this.addEventListener('pointerup', this.handleCanvasPointerUp);

    this.syncActiveState();
  }

  disconnectedCallback(): void {
    this.resizeObserver.disconnect();
    this.disposeUiSubscription?.();
    this.disposeUiSubscription = undefined;
    this.disposeTabsSubscription?.();
    this.disposeTabsSubscription = undefined;
    this.removeEventListener('keydown', this.handleKeyDown);
    this.removeEventListener('pointerdown', this.handleCanvasPointerDown);
    this.removeEventListener('pointermove', this.handleCanvasPointerMove);
    this.removeEventListener('pointerup', this.handleCanvasPointerUp);
    super.disconnectedCallback();
  }

  protected firstUpdated(): void {
    this.canvasHost = this.renderRoot.querySelector<HTMLElement>('.viewport-host') ?? undefined;
    if (this.canvasHost) {
      try {
        this.resizeObserver.observe(this);
      } catch {
        // ignore
      }
    }
    this.syncActiveState();
  }

  protected render() {
    const tab = appState.tabs.tabs.find(t => t.id === this.tabId);
    const isSceneTab = tab?.type === 'scene';

    return html`
      <section class="panel" role="region" aria-label="Editor tab" tabindex="0">
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

  private zoomDefault(): void {
    this.viewportRenderer.zoomDefault();
  }

  private zoomAll(): void {
    this.viewportRenderer.zoomAll();
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (appState.tabs.activeTabId !== this.tabId) return;
    if (event.target !== this && !this.contains(event.target as Node)) {
      return;
    }

    switch (event.key.toLowerCase()) {
      case 'q':
        event.preventDefault();
        this.handleTransformModeChange('select');
        break;
      case 'w':
        event.preventDefault();
        this.handleTransformModeChange('translate');
        break;
      case 'e':
        event.preventDefault();
        this.handleTransformModeChange('rotate');
        break;
      case 'r':
        event.preventDefault();
        this.handleTransformModeChange('scale');
        break;
      case 'g':
        event.preventDefault();
        this.toggleGrid();
        break;
      case '2':
        event.preventDefault();
        this.toggleLayer2D();
        break;
      case '3':
        event.preventDefault();
        this.toggleLayer3D();
        break;
      case 'home':
        event.preventDefault();
        this.zoomDefault();
        break;
      case 'f':
        event.preventDefault();
        this.zoomAll();
        break;
    }
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
    if (!this.pointerDownPos || !this.pointerDownTime) return;

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
