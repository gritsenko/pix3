import { ComponentBase, customElement, html, inject, subscribe, state, css, unsafeCSS } from '@/fw';
import { ViewportRendererService, type TransformMode } from '@/core/rendering';
import { SceneManager } from '@/core/scene';
import { appState } from '@/state';
import styles from './viewport-panel.ts.css?raw';
@customElement('pix3-viewport-panel')
export class ViewportPanel extends ComponentBase {
  static useShadowDom = true

  @inject(ViewportRendererService)
  private readonly viewportRenderer!: ViewportRendererService;
  @inject(SceneManager)
  private readonly sceneManager!: SceneManager;

  @state()
  private transformMode: TransformMode = 'translate';
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

  connectedCallback() {
    super.connectedCallback();
    // ResizeObserver will be set up in firstUpdated when host element is available
    this.disposeSceneSubscription = subscribe(appState.scenes, () => {
      this.syncViewportScene();
    });
    this.syncViewportScene();

    // Add keyboard shortcuts for transform modes
    this.addEventListener('keydown', this.handleKeyDown);
  }

  disconnectedCallback() {
    this.viewportRenderer.dispose();
    this.canvas = undefined;
    super.disconnectedCallback();
    this.resizeObserver.disconnect();
    this.disposeSceneSubscription?.();
    this.disposeSceneSubscription = undefined;
    this.removeEventListener('keydown', this.handleKeyDown);
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
        <canvas class="viewport-canvas" part="canvas" aria-hidden="true"></canvas>
        <div class="overlay" aria-hidden="true">
          <!-- Transform Toolbar -->
          <div class="toolbar-overlay">${this.renderTransformToolbar()}</div>
        </div>
      </section>
    `;
  }

  private renderTransformToolbar() {
    const transformModes: Array<{ mode: TransformMode; icon: string; label: string; key: string }> =
      [
        { mode: 'translate', icon: '↔', label: 'Move (W)', key: 'W' },
        { mode: 'rotate', icon: '⟳', label: 'Rotate (E)', key: 'E' },
        { mode: 'scale', icon: '⤢', label: 'Scale (R)', key: 'R' },
      ];

    return html`
      <div class="transform-toolbar">
        ${transformModes.map(
          ({ mode, icon, label }) => html`
            <button
              class="toolbar-button ${this.transformMode === mode ? 'toolbar-button--active' : ''}"
              @click=${() => this.handleTransformModeChange(mode)}
              title=${label}
              aria-label=${label}
            >
              ${icon}
            </button>
          `
        )}
      </div>
    `;
  }

  private syncViewportScene(): void {
    const { loadState, activeSceneId } = appState.scenes;
    const primaryGraph = activeSceneId ? this.sceneManager.getSceneGraph(activeSceneId) : null;
    const fallbackGraph = this.sceneManager.getActiveSceneGraph();
    const graph = primaryGraph ?? fallbackGraph;

    if (graph) {
      this.viewportRenderer.setSceneGraph(graph);
      return;
    }

    if (loadState === 'ready' && !this.viewportRenderer.hasActiveSceneGraph()) {
      this.viewportRenderer.setSceneGraph(null);
    }
  }

  private handleTransformModeChange(mode: TransformMode): void {
    this.transformMode = mode;
    this.viewportRenderer.setTransformMode(mode);
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    // Only handle keypresses when viewport has focus or is active
    if (event.target !== this && !this.contains(event.target as Node)) {
      return;
    }

    switch (event.key.toLowerCase()) {
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
    }
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
