import { ComponentBase, customElement, html, inject, state, css, unsafeCSS } from '@/fw';
import { SceneManager, SceneRunner, RuntimeRenderer } from '@pix3/runtime';
import { appState } from '@/state';
import { subscribe } from 'valtio/vanilla';
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
    private viewportContainer?: HTMLElement;
    private resizeObserver?: ResizeObserver;
    private disposeSubscription?: () => void;

    connectedCallback(): void {
        super.connectedCallback();
        this.startResizeObserver();
    }

    disconnectedCallback(): void {
        super.disconnectedCallback();
        this.stopGame();
        this.resizeObserver?.disconnect();
        this.disposeSubscription?.();
        window.removeEventListener('focus', this.onFocus);
        window.removeEventListener('blur', this.onBlur);
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }

    protected firstUpdated(): void {
        this.viewportContainer = this.shadowRoot?.querySelector('.viewport-container') as HTMLElement;
        this.gameContainer = this.shadowRoot?.querySelector('.game-host') as HTMLElement;

        if (this.gameContainer) {
            void this.initGame();
        }

        if (this.viewportContainer) {
            this.resizeObserver?.observe(this.viewportContainer);
        }
    }

    private startResizeObserver() {
        this.resizeObserver = new ResizeObserver(() => {
            this.handleResize();
        });
    }

    private handleResize() {
        this.applyViewportFit();

        if (this.renderer && this.gameContainer) {
            this.renderer.resize();
        }
    }

    private applyViewportFit() {
        if (!this.gameContainer || !this.viewportContainer) {
            return;
        }

        if (this.aspectRatio === 'free') {
            this.gameContainer.style.width = '100%';
            this.gameContainer.style.height = '100%';
            return;
        }

        const targetAspect = this.getAspectValue(this.aspectRatio);
        const availableWidth = this.viewportContainer.clientWidth;
        const availableHeight = this.viewportContainer.clientHeight;

        if (availableWidth <= 0 || availableHeight <= 0) {
            return;
        }

        let fittedWidth = availableWidth;
        let fittedHeight = fittedWidth / targetAspect;

        if (fittedHeight > availableHeight) {
            fittedHeight = availableHeight;
            fittedWidth = fittedHeight * targetAspect;
        }

        this.gameContainer.style.width = `${Math.floor(fittedWidth)}px`;
        this.gameContainer.style.height = `${Math.floor(fittedHeight)}px`;
    }

    private getAspectValue(aspectRatio: '16:9-landscape' | '16:9-portrait' | '4:3'): number {
        switch (aspectRatio) {
            case '16:9-landscape':
                return 16 / 9;
            case '16:9-portrait':
                return 9 / 16;
            case '4:3':
                return 4 / 3;
        }
    }

    private isAspectRatio(value: string): value is 'free' | '16:9-landscape' | '16:9-portrait' | '4:3' {
        return value === 'free' || value === '16:9-landscape' || value === '16:9-portrait' || value === '4:3';
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

        // Handle focus pausing
        window.addEventListener('focus', this.onFocus);
        window.addEventListener('blur', this.onBlur);
        document.addEventListener('visibilitychange', this.onVisibilityChange);

        this.disposeSubscription = subscribe(appState.ui, () => {
            this.handleFocusPause();
        });
    }

    private onFocus = () => {
        this.handleFocusPause();
    };

    private onBlur = () => {
        this.handleFocusPause();
    };

    private onVisibilityChange = () => {
        this.handleFocusPause();
    };

    private handleFocusPause() {
        if (!this.runner) return;

        const isVisible = document.visibilityState === 'visible' && document.hasFocus();
        const shouldPause = appState.ui.pauseRenderingOnUnfocus && !isVisible;
        if (shouldPause) {
            this.runner.pause();
        } else {
            this.runner.resume();
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
        if (!this.isAspectRatio(target.value)) {
            return;
        }

        this.aspectRatio = target.value;
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
