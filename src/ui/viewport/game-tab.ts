import { ComponentBase, customElement, html, inject, state, css, unsafeCSS } from '@/fw';
import { SceneManager, SceneRunner, RuntimeRenderer } from '@pix3/runtime';
import { appState } from '@/state';
import styles from './game-tab.ts.css?raw';
import { CommandDispatcher } from '@/services/CommandDispatcher';

@customElement('pix3-game-tab')
export class GameViewTab extends ComponentBase {
    static useShadowDom = true;

    @inject(SceneManager)
    private readonly sceneManager!: SceneManager;

    @inject(CommandDispatcher)
    private readonly commandDispatcher!: CommandDispatcher;

    @state()
    private aspectRatio: 'free' | '16:9-landscape' | '16:9-portrait' | '4:3' = 'free';

    private runner?: SceneRunner;
    private renderer?: RuntimeRenderer;
    private gameContainer?: HTMLElement;
    private resizeObserver?: ResizeObserver;

    connectedCallback(): void {
        super.connectedCallback();
        this.startResizeObserver();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.stopGame();
        this.resizeObserver?.disconnect();
    }

    protected firstUpdated(): void {
        this.gameContainer = this.shadowRoot?.querySelector('.game-host') as HTMLElement;

        if (this.gameContainer) {
            void this.initGame();
            // Observe the container for resizing
            this.resizeObserver?.observe(this.gameContainer);
        }
    }

    private startResizeObserver() {
        this.resizeObserver = new ResizeObserver(() => {
            this.handleResize();
        });
    }

    private handleResize() {
        if (this.renderer && this.gameContainer) {
            // The RuntimeRenderer.resize() method automatically checks parent dimensions if using its default behavior,
            // but here we might need to be explicit if we are using aspect-ratio CSS.
            // Actually, RuntimeRenderer.resize() uses this.canvas.parentElement.clientWidth/Height.
            // So calling it should be enough.
            this.renderer.resize();
        }
    }

    private async initGame() {
        if (!this.gameContainer) return;
        if (this.runner) return; // Already running

        // 1. Create Renderer
        this.renderer = new RuntimeRenderer({
            antialias: true,
            shadows: true,
        });
        this.renderer.attach(this.gameContainer);

        // 2. Create Runner
        this.runner = new SceneRunner(this.sceneManager, this.renderer);

        // 3. Start Scene
        const activeSceneId = appState.scenes.activeSceneId;
        if (activeSceneId) {
            console.log(`[GameView] Starting scene: ${activeSceneId}`);
            try {
                await this.runner.startScene(activeSceneId);
            } catch (error) {
                console.error('[GameView] Failed to start scene:', error);
            }
        } else {
            console.warn('[GameView] No active scene to play.');
        }
    }

    private stopGame() {
        if (this.runner) {
            this.runner.stop();
            this.runner = undefined;
        }
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer = undefined;
        }
    }

    private handleStopClick() {
        this.commandDispatcher.executeById('game.stop');
    }

    private handleAspectChange(e: Event) {
        const target = e.target as HTMLSelectElement;
        this.aspectRatio = target.value as any;
        // Defer resize to allow CSS to apply
        requestAnimationFrame(() => this.handleResize());
    }

    protected render() {
        return html`
      <div class="game-view">
        <div class="top-toolbar">
          <button class="toolbar-button active" @click=${this.handleStopClick} title="Stop Game">
            <span style="margin-right: 4px;">■</span> Stop
          </button>
          
          <div class="toolbar-separator"></div>

          <select class="aspect-selector" @change=${this.handleAspectChange} .value=${this.aspectRatio}>
            <option value="free">Free Aspect</option>
            <option value="16:9-landscape">16:9 Landscape</option>
            <option value="16:9-portrait">16:9 Portrait</option>
            <option value="4:3">4:3</option>
          </select>
        </div>

        <div class="viewport-container">
          <div class="game-host aspect-${this.aspectRatio.replace(':', '-')}" part="game-host">
            <!-- Canvas will be attached here -->
          </div>
        </div>
      </div>
    `;
    }

    static styles = css`
    ${unsafeCSS(styles)}
  `;
}

declare global {
    interface HTMLElementTagNameMap {
        'pix3-game-tab': GameViewTab;
    }
}
