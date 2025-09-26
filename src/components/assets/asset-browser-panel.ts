import { ComponentBase, css, customElement, html } from '../../fw';

@customElement('pix3-asset-browser-panel')
export class AssetBrowserPanel extends ComponentBase {
    protected render() {
        return html`
            <section class="panel" role="region" aria-labelledby="asset-browser-title">
                <header id="asset-browser-title" class="panel__header" tabindex="0">
                    <span class="panel__title">Asset Browser</span>
                </header>
                <div class="panel__body" role="list" aria-label="Project assets">
                    <p class="panel__placeholder">
                        Open a project to browse textures, models, and prefabs.
                    </p>
                </div>
            </section>
        `;
    }

    static styles = css`
        .panel {
            display: flex;
            flex-direction: column;
            height: 100%;
            color: var(--pix3-panel-foreground, #f3f3f3);
            background: var(--pix3-panel-background, rgba(24, 27, 33, 0.95));
        }

        .panel__header {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.625rem 0.75rem;
            font-size: 0.75rem;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            font-weight: 600;
            background: var(--pix3-panel-header-background, rgba(41, 45, 50, 0.9));
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .panel__body {
            flex: 1;
            overflow: auto;
            padding: 0.75rem;
            font-size: 0.875rem;
        }

        .panel__placeholder {
            margin: 0;
            color: rgba(240, 240, 240, 0.6);
            font-style: italic;
        }
    `;
}

declare global {
    interface HTMLElementTagNameMap {
        'pix3-asset-browser-panel': AssetBrowserPanel;
    }
}
