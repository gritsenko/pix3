import { subscribe } from 'valtio/vanilla';

import {
    ComponentBase,
    css,
    customElement,
    html,
    inject,
    property,
    state,
} from '../../fw';
import { LayoutManagerService } from '../../core/layout';
import { appState, PERSONA_IDS, type PersonaId } from '../../state';

@customElement('pix3-editor')
export class Pix3Editor extends ComponentBase {
    @inject(LayoutManagerService)
    private readonly layoutManager!: LayoutManagerService;

    @state()
    private activePersona: PersonaId = appState.ui.persona;

    @state()
    private isLayoutReady = appState.ui.isLayoutReady;

    @property({ type: Boolean, reflect: true, attribute: 'shell-ready' })
    protected shellReady = false;

    private disposeSubscription?: () => void;

    connectedCallback(): void {
        super.connectedCallback();
        this.disposeSubscription = subscribe(appState.ui, () => {
            this.activePersona = appState.ui.persona;
            this.isLayoutReady = appState.ui.isLayoutReady;
            this.shellReady = this.isLayoutReady;
            this.requestUpdate();
        });
    }

    disconnectedCallback(): void {
        this.disposeSubscription?.();
        this.disposeSubscription = undefined;
        super.disconnectedCallback();
    }

    protected async firstUpdated(): Promise<void> {
        const host = this.renderRoot.querySelector<HTMLDivElement>('.layout-host');
        if (!host) {
            return;
        }

        await this.layoutManager.initialize(host);
        this.shellReady = true;
    }

    protected render() {
        return html`
            <div class="editor-shell" data-ready=${this.shellReady ? 'true' : 'false'}>
                ${this.renderToolbar()}
                <div class="workspace" role="presentation">
                    <div class="layout-host" role="application" aria-busy=${!this.isLayoutReady}></div>
                    ${this.isLayoutReady
                        ? html``
                        : html`<div class="loading-overlay" role="status">
                              <span class="loading-label">Preparing workspace…</span>
                          </div>`}
                </div>
            </div>
        `;
    }

    private renderToolbar() {
        return html`
            <header class="toolbar" role="banner">
                <h1 class="product-title" aria-level="1">Pix3 Editor</h1>
                <div class="toolbar__spacer" aria-hidden="true"></div>
                <label class="persona-picker">
                    <span class="persona-picker__label">Persona preset</span>
                    <select
                        class="persona-picker__select"
                        @change=${this.onPersonaChange}
                        .value=${this.activePersona}
                        aria-label="Select workspace persona preset"
                    >
                        ${PERSONA_IDS.map((persona) => html`<option value=${persona}>${this.describePersona(persona)}</option>`)}
                    </select>
                </label>
            </header>
        `;
    }

    private onPersonaChange = (event: Event): void => {
        const select = event.currentTarget as HTMLSelectElement | null;
        if (!select) {
            return;
        }

        const persona = select.value as PersonaId;
        if (persona === this.activePersona) {
            return;
        }

        void this.layoutManager.applyPersonaPreset(persona);
    };

    private describePersona(persona: PersonaId): string {
        switch (persona) {
            case 'gameplay-engineer':
                return 'Gameplay Engineer';
            case 'playable-ad-producer':
                return 'Playable Ad Producer';
            case 'technical-artist':
            default:
                return 'Technical Artist';
        }
    }

    static styles = css`
        :host {
            display: block;
            height: 100%;
        }

        .editor-shell {
            display: grid;
            grid-template-rows: auto 1fr;
            height: 100%;
            background: var(--pix3-shell-background, #1b1e24);
            color: #f3f4f6;
        }

        .toolbar {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 0.75rem 1.25rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(19, 22, 27, 0.95);
            backdrop-filter: blur(18px);
        }

        .product-title {
            margin: 0;
            font-size: 1rem;
            font-weight: 600;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .toolbar__spacer {
            flex: 1;
        }

        .persona-picker {
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
            font-size: 0.75rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .persona-picker__label {
            color: rgba(240, 240, 240, 0.65);
        }

        .persona-picker__select {
            min-width: 14rem;
            background: rgba(39, 44, 53, 0.9);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: #f3f4f6;
            padding: 0.35rem 0.65rem;
            border-radius: 0.4rem;
            font-size: 0.9rem;
        }

        .persona-picker__select:focus {
            outline: 2px solid #5ec2ff;
            outline-offset: 2px;
        }

        .workspace {
            position: relative;
            min-height: 0;
            display: block;
        }

        .layout-host {
            position: absolute;
            inset: 0;
        }

        .loading-overlay {
            position: absolute;
            inset: 0;
            display: grid;
            place-items: center;
            background: rgba(18, 20, 24, 0.72);
        }

        .loading-label {
            padding: 0.5rem 0.75rem;
            border-radius: 0.5rem;
            background: rgba(34, 38, 44, 0.86);
            box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
            font-size: 0.85rem;
            letter-spacing: 0.04em;
        }
    `;
}

declare global {
    interface HTMLElementTagNameMap {
        'pix3-editor': Pix3Editor;
    }
}
