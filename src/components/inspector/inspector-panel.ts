import { ComponentBase, css, customElement, html } from '../../fw';

import '../ui/pix3-panel';

@customElement('pix3-inspector-panel')
export class InspectorPanel extends ComponentBase {
    protected render() {
        return html`
            <pix3-panel
                panel-title="Inspector"
                panel-role="form"
                panel-description="Adjust properties for the currently selected node."
                actions-label="Inspector actions"
            >
                <div class="inspector-body">
                    <p class="panel-placeholder">
                        Select a node from the scene tree to edit its properties.
                    </p>
                </div>
            </pix3-panel>
        `;
    }

    static styles = css`
        :host {
            display: block;
            height: 100%;
        }

        pix3-panel {
            height: 100%;
        }

        .inspector-body {
            display: grid;
            place-items: start;
            gap: 1rem;
        }
    `;
}

declare global {
    interface HTMLElementTagNameMap {
        'pix3-inspector-panel': InspectorPanel;
    }
}
