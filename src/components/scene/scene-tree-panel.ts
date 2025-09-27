import { ComponentBase, css, customElement, html } from '../../fw';

import '../ui/pix3-panel';

@customElement('pix3-scene-tree-panel')
export class SceneTreePanel extends ComponentBase {
    protected render() {
        return html`
            <pix3-panel
                panel-title="Scene Tree"
                panel-description="Browse and organise the hierarchy of nodes in the active scene."
                actions-label="Scene tree controls"
            >
                <div class="tree-container" role="tree" aria-label="Scene nodes">
                    <p class="panel-placeholder">
                        Scene hierarchy will appear here once a project is loaded.
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

        .tree-container {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            min-height: 100%;
        }
    `;
}

declare global {
    interface HTMLElementTagNameMap {
        'pix3-scene-tree-panel': SceneTreePanel;
    }
}
