import { ComponentBase, css, customElement, html } from '../../fw';

@customElement('pix3-inspector-panel')
export class InspectorPanel extends ComponentBase {
    protected render() {
        return html`
            <section class="panel" role="form" aria-labelledby="inspector-title">
                <header id="inspector-title" class="panel__header" tabindex="0">
                    <span class="panel__title">Inspector</span>
                </header>
                <div class="panel__body">
                    <p class="panel__placeholder">
                        Select a node from the scene tree to edit its properties.
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
            background: var(--pix3-panel-background, rgba(27, 30, 36, 0.95));
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
            display: grid;
            place-items: start;
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
        'pix3-inspector-panel': InspectorPanel;
    }
}
