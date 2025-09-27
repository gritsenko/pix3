import { ComponentBase, css, customElement, html, inject, subscribe } from '../../fw';
import { ViewportRendererService } from '../../rendering';
import { SceneManager } from '../../core/scene';
import { appState } from '../../state';

@customElement('pix3-viewport-panel')
export class ViewportPanel extends ComponentBase {
  protected static useShadowDom = true;

  @inject(ViewportRendererService)
  private readonly viewportRenderer!: ViewportRendererService;
  @inject(SceneManager)
  private readonly sceneManager!: SceneManager;
  private readonly resizeObserver = new ResizeObserver(entries => {
    const entry = entries[0];
    if (!entry) {
      return;
    }
    const { width, height } = entry.contentRect;
    if (width <= 0 || height <= 0) {
      return;
    }
    this.viewportRenderer.resize(width, height);
  });

  private canvas?: HTMLCanvasElement;
  private disposeSceneSubscription?: () => void;

  connectedCallback() {
    super.connectedCallback();
    // ResizeObserver will be set up in firstUpdated when canvas is available
    this.disposeSceneSubscription = subscribe(appState.scenes, () => {
      this.syncViewportScene();
    });
    this.syncViewportScene();
  }

  disconnectedCallback() {
    this.viewportRenderer.dispose();
    this.canvas = undefined;
    super.disconnectedCallback();
    this.resizeObserver.disconnect();
    this.disposeSceneSubscription?.();
    this.disposeSceneSubscription = undefined;
  }

  protected firstUpdated(): void {
    this.canvas = this.renderRoot.querySelector<HTMLCanvasElement>('.viewport-canvas') ?? undefined;
    if (!this.canvas) {
      console.warn('[ViewportPanel] Missing canvas element for renderer initialization.');
      return;
    }

    this.resizeObserver.observe(this.canvas);
    this.viewportRenderer.initialize(this.canvas);
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.viewportRenderer.resize(rect.width, rect.height);
    }
    this.syncViewportScene();
  }

  protected render() {
    return html`
      <section class="panel" role="region" aria-label="Scene viewport">
        <canvas class="viewport-canvas" part="canvas" aria-hidden="true"></canvas>
        <div class="overlay" aria-hidden="true">
          <div class="hud">
            <span class="hud__label">Viewport Online</span>
            <ul class="hud__controls">
              <li><kbd>Left Drag</kbd><span>Orbit</span></li>
              <li><kbd>Right Drag</kbd><span>Pan</span></li>
              <li><kbd>Scroll</kbd><span>Zoom</span></li>
            </ul>
          </div>
        </div>
      </section>
    `;
  }

  private syncViewportScene(): void {
    const { loadState, activeSceneId } = appState.scenes;
    if (loadState !== 'ready') {
      if (!this.sceneManager.getActiveSceneGraph()) {
        this.viewportRenderer.setSceneGraph(null);
      }
      return;
    }

    const primaryGraph = activeSceneId ? this.sceneManager.getSceneGraph(activeSceneId) : null;
    const graph = primaryGraph ?? this.sceneManager.getActiveSceneGraph();
    this.viewportRenderer.setSceneGraph(graph);
  }

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
      align-items: flex-start;
      justify-content: flex-end;
      padding: 1.25rem;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(10, 13, 18, 0) 55%);
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
