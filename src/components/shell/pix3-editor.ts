import { subscribe } from 'valtio/vanilla';

import { ComponentBase, css, customElement, html, inject, property, state } from '../../fw';
import { LayoutManagerService } from '../../core/layout';
import { LoadSceneCommand } from '../../core/commands/LoadSceneCommand';
import { appState, PERSONA_IDS, type PersonaId } from '../../state';
import '../ui/pix3-toolbar';
import '../ui/pix3-toolbar-button';

@customElement('pix3-editor')
export class Pix3Editor extends ComponentBase {
  @inject(LayoutManagerService)
  private readonly layoutManager!: LayoutManagerService;

  // Inject command used to load the startup scene
  @inject(LoadSceneCommand) private readonly loadSceneCommand!: LoadSceneCommand;

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

    // Kick off loading of the pending startup scene (first in queue) if any
    const pending = appState.scenes.pendingScenePaths[0];
    if (pending) {
      // Ensure FileSystemAPIService resource prefix logic is available
      await this.loadSceneCommand.execute({ filePath: pending });
    }
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
      <pix3-toolbar aria-label="Editor toolbar">
        <span slot="start" class="product-title" role="heading" aria-level="1"> Pix3 Editor </span>
        <div class="toolbar-content">
          <label class="persona-picker">
            <span class="persona-picker__label">Persona preset</span>
            <select
              class="persona-picker__select"
              @change=${this.onPersonaChange}
              .value=${this.activePersona}
              aria-label="Select workspace persona preset"
            >
              ${PERSONA_IDS.map(
                persona => html`<option value=${persona}>${this.describePersona(persona)}</option>`
              )}
            </select>
          </label>
        </div>
        <pix3-toolbar-button
          slot="actions"
          aria-label="Open command palette"
          @click=${this.onCommandPaletteRequest}
        >
          Palette
        </pix3-toolbar-button>
        <pix3-toolbar-button
          slot="actions"
          aria-label="Reapply persona layout"
          ?disabled=${!this.isLayoutReady}
          @click=${this.onPersonaRefreshRequest}
        >
          Layout
        </pix3-toolbar-button>
      </pix3-toolbar>
    `;
  }

  private onCommandPaletteRequest = (): void => {
    this.dispatchEvent(
      new CustomEvent('pix3-command-palette-requested', {
        bubbles: true,
        composed: true,
        detail: { source: 'shell-toolbar' },
      })
    );
  };

  private onPersonaRefreshRequest = (): void => {
    void this.layoutManager.applyPersonaPreset(this.activePersona);
  };

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
      inline-size: 100%;
      block-size: 100%;
    }

    .editor-shell {
      display: grid;
      grid-template-rows: auto 1fr;
      min-block-size: 100vh;
      min-block-size: 100dvh;
      background: var(--pix3-shell-background, #1b1e24);
      color: #f3f4f6;
    }

    pix3-toolbar {
      --pix3-toolbar-background: rgba(19, 22, 27, 0.95);
      --pix3-toolbar-foreground: rgba(243, 244, 246, 0.92);
      inline-size: 100%;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(18px);
    }

    .product-title {
      margin: 0;
      font-size: 0.85rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: rgba(243, 244, 246, 0.72);
    }

    .toolbar-content {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 1rem;
      inline-size: 100%;
    }

    .persona-picker {
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: auto;
      align-items: center;
      gap: 0.65rem;
      font-size: 0.85rem;
    }

    .persona-picker__label {
      color: rgba(240, 240, 240, 0.8);
      text-transform: none;
      letter-spacing: 0.02em;
      font-weight: 500;
    }

    .persona-picker__select {
      min-width: 13rem;
      background: rgba(39, 44, 53, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #f5f6f8;
      padding: 0.4rem 0.75rem;
      border-radius: 0.45rem;
      font-size: 0.95rem;
      line-height: 1.1;
    }

    .persona-picker__select:focus {
      outline: 2px solid #5ec2ff;
      outline-offset: 2px;
    }

    .workspace {
      position: relative;
      min-height: 0;
      block-size: 100%;
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
