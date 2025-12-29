import { ComponentBase, customElement, html, inject, subscribe, state, css, unsafeCSS } from '@/fw';
import { appState } from '@/state';
import styles from './viewport-panel.ts.css?raw';
import { ViewportRendererService, type TransformMode } from '@/services/ViewportRenderService';
import { CommandDispatcher } from '@/services/CommandDispatcher';
import { selectObject } from '@/features/selection/SelectObjectCommand';
import renderTransformToolbar from './transform-toolbar';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import feather from 'feather-icons';

@customElement('pix3-viewport-panel')
export class ViewportPanel extends ComponentBase {
  static useShadowDom = true;

  @inject(ViewportRendererService)
  private readonly viewportRenderer!: ViewportRendererService;

  @inject(CommandDispatcher)
  private readonly commandDispatcher!: CommandDispatcher;

  @state()
  private transformMode: TransformMode = 'select';

  @state()
  private showGrid = false;

  @state()
  private showLayer2D = false;

  private readonly resizeObserver = new ResizeObserver(entries => {
    const entry = entries[0];
    if (!entry) {
      return;
    }
    const { width, height } = entry.contentRect;
    if (width <= 0 || height <= 0) {
      return;
    }
    // Observe the host container size (may be different from canvas CSS size when splitters
    // or layout managers change dimensions). Forward the measured size to the renderer.
    this.viewportRenderer.resize(width, height);
  });

  private canvas?: HTMLCanvasElement;
  private disposeSceneSubscription?: () => void;
  private pointerDownPos?: { x: number; y: number };
  private pointerDownTime?: number;
  private isDragging = false;
  private readonly dragThreshold = 5; // pixels

  connectedCallback() {
    super.connectedCallback();
    // ResizeObserver will be set up in firstUpdated when host element is available
    this.disposeSceneSubscription = subscribe(appState.scenes, () => {
      this.syncViewportScene();
    });
    this.syncViewportScene();

    subscribe(appState.ui, () => {
      this.showGrid = appState.ui.showGrid;
      this.showLayer2D = appState.ui.showLayer2D;
    });

    // Add keyboard shortcuts for transform modes
    this.addEventListener('keydown', this.handleKeyDown);
    // Add pointer handlers for object selection (only on tap/click, not drag)
    this.addEventListener('pointerdown', this.handleCanvasPointerDown);
    this.addEventListener('pointermove', this.handleCanvasPointerMove);
    this.addEventListener('pointerup', this.handleCanvasPointerUp);
  }

  disconnectedCallback() {
    this.viewportRenderer.dispose();
    this.canvas = undefined;
    super.disconnectedCallback();
    this.resizeObserver.disconnect();
    this.disposeSceneSubscription?.();
    this.disposeSceneSubscription = undefined;
    this.removeEventListener('keydown', this.handleKeyDown);
    this.removeEventListener('pointerdown', this.handleCanvasPointerDown);
    this.removeEventListener('pointermove', this.handleCanvasPointerMove);
    this.removeEventListener('pointerup', this.handleCanvasPointerUp);
    this.pointerDownPos = undefined;
    this.pointerDownTime = undefined;
    this.isDragging = false;
  }

  protected firstUpdated(): void {
    this.canvas = this.renderRoot.querySelector<HTMLCanvasElement>('.viewport-canvas') ?? undefined;
    if (!this.canvas) {
      console.warn('[ViewportPanel] Missing canvas element for renderer initialization.');
      return;
    }

    // Observe the component host (the element itself) instead of the canvas. When the
    // surrounding layout (Golden Layout splitters or window resizes) changes the host
    // bounding rect, we want to update the renderer to match the visible area.
    // Using the host avoids cases where the canvas CSS size remains unchanged while
    // the host shrinks/grows due to layout adjustments.
    try {
      this.resizeObserver.observe(this);
    } catch {
      // Fallback to observing the canvas if observing the host fails in some environments.
      this.resizeObserver.observe(this.canvas);
    }

    this.viewportRenderer.initialize(this.canvas);
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.viewportRenderer.resize(rect.width, rect.height);
    }

    // Sync scene after renderer is fully initialized
    this.syncViewportScene();
  }

  protected render() {
    return html`
      <section class="panel" role="region" aria-label="Scene viewport" tabindex="0">
        <div
          class="top-toolbar"
          @click=${(e: Event) => e.stopPropagation()}
          @pointerdown=${(e: Event) => e.stopPropagation()}
          @pointerup=${(e: Event) => e.stopPropagation()}
        >
          <!-- Transform mode buttons -->
          ${renderTransformToolbar(this.transformMode, m => this.handleTransformModeChange(m))}
          <div class="toolbar-separator"></div>
          <!-- Viewport controls -->
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
            <span class="toolbar-icon">${unsafeHTML(this.getIcon('grid'))}</span>
          </button>
          <button
            class="toolbar-button"
            aria-label="Toggle 2D layer"
            aria-pressed="${this.showLayer2D}"
            @click="${(e: Event) => {
              e.stopPropagation();
              e.stopImmediatePropagation();
              this.toggleLayer2D();
            }}"
            title="Toggle 2D Layer (2)"
          >
            <span class="toolbar-icon">${unsafeHTML(this.getIcon('layers'))}</span>
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
            <span class="toolbar-icon">${unsafeHTML(this.getIcon('home'))}</span>
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
            <span class="toolbar-icon">${unsafeHTML(this.getIcon('maximize-2'))}</span>
          </button>
        </div>
        <canvas class="viewport-canvas" part="canvas" aria-hidden="true"></canvas>
      </section>
    `;
  }

  private syncViewportScene(): void {
    // Renderer now auto-attaches active scene via subscription; nothing to do here
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

  private zoomDefault(): void {
    this.viewportRenderer.zoomDefault();
  }

  private zoomAll(): void {
    this.viewportRenderer.zoomAll();
  }

  private getIcon(name: string): string {
    try {
      const icon = (feather.icons as Record<string, any>)[name];
      if (icon && typeof icon.toSvg === 'function') {
        return icon.toSvg({ width: 16, height: 16 });
      }
    } catch (error) {
      console.warn(`[ViewportPanel] Failed to load icon: ${name}`, error);
    }
    return '';
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    // Only handle keypresses when viewport has focus or is active
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
    // Ignore pointer events from toolbar
    const isToolbar = event.composedPath().some(el =>
      el instanceof HTMLElement && (el.classList.contains('top-toolbar') || el.classList.contains('toolbar-button'))
    );
    if (isToolbar) {
      return;
    }

    const isCanvasTarget = (event.target as HTMLElement)?.classList?.contains('viewport-canvas');
    if (event.target !== this && !isCanvasTarget) {
      return;
    }

    // Use canvas rect, not panel rect, since canvas is offset by toolbar
    const rect = this.canvas?.getBoundingClientRect() ?? this.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    const handleType = this.viewportRenderer.get2DHandleAt?.(screenX, screenY);
    if (handleType && handleType !== 'idle') {
      // Start 2D transform (move, scale, or rotate)
      this.viewportRenderer.start2DTransform?.(screenX, screenY, handleType);
      this.pointerDownPos = { x: event.clientX, y: event.clientY };
      this.pointerDownTime = Date.now();
      this.isDragging = true;
      return;
    }

    // Record the position and time for drag detection
    this.pointerDownPos = { x: event.clientX, y: event.clientY };
    this.pointerDownTime = Date.now();
    this.isDragging = false;
  };

  private handleCanvasPointerMove = (event: PointerEvent): void => {
    // Only process if pointer was pressed down
    if (!this.pointerDownPos || !this.pointerDownTime) {
      return;
    }

    // Handle 2D transform updates when a 2D handle is engaged
    const has2DTransform = this.viewportRenderer.has2DTransform?.();
    if (has2DTransform) {
      // Use canvas rect, not panel rect, since canvas is offset by toolbar
      const rect = this.canvas?.getBoundingClientRect() ?? this.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;

      this.viewportRenderer.update2DTransform?.(screenX, screenY);
      this.isDragging = true;
      return;
    }

    // Calculate distance moved since pointer down
    const dx = event.clientX - this.pointerDownPos.x;
    const dy = event.clientY - this.pointerDownPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // If distance exceeds threshold, mark as dragging (camera manipulation)
    if (distance > this.dragThreshold) {
      this.isDragging = true;
    }
  };

  private handleCanvasPointerUp = (event: PointerEvent): void => {
    // Ignore pointer events from toolbar
    const isToolbar = event.composedPath().some(el =>
      el instanceof HTMLElement && (el.classList.contains('top-toolbar') || el.classList.contains('toolbar-button'))
    );
    if (isToolbar) {
      this.pointerDownPos = undefined;
      this.pointerDownTime = undefined;
      this.isDragging = false;
      return;
    }

    const isCanvasTarget = (event.target as HTMLElement)?.classList?.contains('viewport-canvas');
    if (event.target !== this && !isCanvasTarget) {
      return;
    }

    // Complete 2D transform if active
    const has2DTransform = this.viewportRenderer.has2DTransform?.();
    if (has2DTransform) {
      this.viewportRenderer.complete2DTransform?.();
      this.pointerDownPos = undefined;
      this.pointerDownTime = undefined;
      this.isDragging = false;
      return;
    }

    if (!this.canvas) {
      this.pointerDownPos = undefined;
      this.pointerDownTime = undefined;
      this.isDragging = false;
      return;
    }

    // Only select if this was a tap (not a drag)
    if (!this.isDragging) {
      // Get canvas position and dimensions
      const rect = this.canvas.getBoundingClientRect();
      const canvasWidth = rect.width;
      const canvasHeight = rect.height;

      // Convert pointer event coordinates to canvas-relative coordinates
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;

      // Normalize to 0-1 range
      const normalizedX = pointerX / canvasWidth;
      const normalizedY = pointerY / canvasHeight;

      // Raycast to find object under pointer
      const hitNode = this.viewportRenderer.raycastObject(normalizedX, normalizedY);

      if (hitNode) {
        // Dispatch SelectObjectCommand with the hit node
        const command = selectObject(hitNode.nodeId);
        this.commandDispatcher.execute(command);
      } else {
        // Pointer up on empty space - deselect all
        const command = selectObject(null);
        this.commandDispatcher.execute(command);
      }
    }

    // Clean up pointer tracking
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
    'pix3-viewport-panel': ViewportPanel;
  }
}
