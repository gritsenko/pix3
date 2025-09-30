import { ComponentBase, css, customElement, html, inject, subscribe, state } from '../../fw';
import { ViewportRendererService, type TransformMode } from '../../core/rendering';
import { SceneManager } from '../../core/scene';
import { appState } from '../../state';

@customElement('pix3-viewport-panel')
export class ViewportPanel extends ComponentBase {
  protected static useShadowDom = true;

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
    } catch (err) {
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
    :host {
      display: block;
      height: 100%;
      width: 100%;
      position: relative;
      background: radial-gradient(circle at top, #20242a, #14171c 70%);
    }

    .panel {
      position: relative;
      height: 100%;
      width: 100%;
      outline: none;
    }

    .panel:focus-visible {
      box-shadow: inset 0 0 0 2px rgba(78, 141, 245, 0.5);
    }

    .viewport-canvas {
      height: 100%;
      width: 100%;
      display: block;
    }

    .overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      padding: 1.25rem;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(10, 13, 18, 0) 55%);
    }

    .toolbar-overlay {
      display: flex;
      justify-content: flex-start;
      margin-bottom: auto;
    }

    .transform-toolbar {
      display: flex;
      gap: 0.25rem;
      pointer-events: auto;
      background: rgba(12, 15, 22, 0.85);
      backdrop-filter: blur(14px);
      border-radius: 0.5rem;
      padding: 0.5rem;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .toolbar-button {
      width: 2.5rem;
      height: 2.5rem;
      border: none;
      border-radius: 0.375rem;
      background: rgba(42, 47, 58, 0.6);
      color: rgba(240, 244, 250, 0.8);
      font-size: 1.1rem;
      cursor: pointer;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .toolbar-button:hover {
      background: rgba(42, 47, 58, 0.9);
      color: rgba(240, 244, 250, 1);
      transform: translateY(-1px);
    }

    .toolbar-button--active {
      background: rgba(78, 141, 245, 0.8);
      color: rgba(255, 255, 255, 1);
      box-shadow: 0 0 0 2px rgba(78, 141, 245, 0.3);
    }

    .toolbar-button--active:hover {
      background: rgba(78, 141, 245, 1);
      transform: translateY(-1px);
    }

    .hud {
      display: inline-flex;
      flex-direction: column;
      gap: 0.4rem;
      padding: 0.65rem 0.85rem;
      border-radius: 0.65rem;
      background: rgba(12, 15, 22, 0.78);
      backdrop-filter: blur(14px);
      box-shadow: 0 18px 28px rgba(0, 0, 0, 0.28);
      color: rgba(240, 244, 250, 0.9);
      align-self: flex-end;
      margin-top: auto;
    }

    .hud__label {
      font-size: 0.72rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(240, 244, 250, 0.58);
    }

    .hud__controls {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 0.2rem;
      font-size: 0.78rem;
      color: rgba(240, 244, 250, 0.85);
    }

    .hud__controls li {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      letter-spacing: 0.02em;
    }

    .hud__controls kbd {
      padding: 0.18rem 0.45rem;
      border-radius: 0.35rem;
      background: rgba(42, 47, 58, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: rgba(240, 244, 250, 0.85);
      font-size: 0.7rem;
      letter-spacing: 0.04em;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-viewport-panel': ViewportPanel;
  }
}
