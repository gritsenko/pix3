import { ComponentBase, css, customElement, html } from '../../fw';

@customElement('pix3-viewport-panel')
export class ViewportPanel extends ComponentBase {
    protected static useShadowDom = true;

    private readonly resizeObserver = new ResizeObserver(() => {
        this.dispatchEvent(new CustomEvent('pix3-viewport-resize', {
            bubbles: true,
            composed: true,
            detail: { width: this.offsetWidth, height: this.offsetHeight }
        }));
    });

    connectedCallback() {
        super.connectedCallback();
        this.resizeObserver.observe(this);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.resizeObserver.disconnect();
    }

    protected render() {
        return html`
            <section class="panel" role="region" aria-label="Scene viewport">
                <canvas class="viewport-canvas" part="canvas" aria-hidden="true"></canvas>
                <div class="overlay" role="presentation">
                    <p class="placeholder">Viewport renderer bootstrap pending</p>
                </div>
            </section>
        `;
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
            display: grid;
            place-items: center;
            pointer-events: none;
            background: linear-gradient(
                135deg,
                rgba(255, 255, 255, 0.06) 0%,
                rgba(255, 255, 255, 0) 55%
            );
        }

        .placeholder {
            margin: 0;
            padding: 0.5rem 0.75rem;
            border-radius: 0.5rem;
            background: rgba(20, 23, 28, 0.85);
            color: rgba(240, 240, 240, 0.82);
            font-size: 0.875rem;
            letter-spacing: 0.02em;
        }
    `;
}

declare global {
    interface HTMLElementTagNameMap {
        'pix3-viewport-panel': ViewportPanel;
    }
}
