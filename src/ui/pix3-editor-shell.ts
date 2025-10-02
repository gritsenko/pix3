import { subscribe } from 'valtio/vanilla';

import { ComponentBase, customElement, html, inject, property, state } from '@/fw';
import { LayoutManagerService } from '@/core/layout/LayoutManager';
import { LoadSceneCommand } from '@/core/commands/LoadSceneCommand';
import { appState } from '@/state';
import './shared/pix3-toolbar';
import './shared/pix3-toolbar-button';
import './welcome/pix3-welcome';
import './pix3-editor-shell.ts.css';

@customElement('pix3-editor')
export class Pix3EditorShell extends ComponentBase {
  @inject(LayoutManagerService)
  private readonly layoutManager!: LayoutManagerService;

  // Inject command used to load the startup scene
  @inject(LoadSceneCommand) private readonly loadSceneCommand!: LoadSceneCommand;
  // project open handled by <pix3-welcome>

  @state()
  private isLayoutReady = appState.ui.isLayoutReady;

  @property({ type: Boolean, reflect: true, attribute: 'shell-ready' })
  protected shellReady = false;

  private disposeSubscription?: () => void;
  private onWelcomeProjectReady?: (e: Event) => void;

  connectedCallback(): void {
    super.connectedCallback();
    this.disposeSubscription = subscribe(appState.ui, () => {
      this.isLayoutReady = appState.ui.isLayoutReady;
      this.shellReady = this.isLayoutReady;
      this.requestUpdate();
    });
    // also subscribe to project state so we can initialize layout once a project is opened
    subscribe(appState.project, () => {
      // if project becomes ready and layout has not been initialized, initialize it
      if (appState.project.status === 'ready') {
        const host = this.renderRoot.querySelector<HTMLDivElement>('.layout-host');
        if (host && !this.shellReady) {
          void this.layoutManager.initialize(host).then(() => {
            this.shellReady = true;
            this.requestUpdate();
          });
        }
      }
    });

    // Listen for the welcome component signaling that project is ready so
    // the shell can remove it from the DOM and proceed with layout initialization.
    this.onWelcomeProjectReady = () => {
      try {
        const welcome = this.renderRoot.querySelector('pix3-welcome');
        if (welcome && welcome.parentElement) {
          welcome.parentElement.removeChild(welcome);
        }
      } catch {
        // ignore
      }
    };
    this.addEventListener(
      'pix3-welcome:project-ready',
      this.onWelcomeProjectReady as EventListener
    );
  }

  disconnectedCallback(): void {
    this.disposeSubscription?.();
    this.disposeSubscription = undefined;
    if (this.onWelcomeProjectReady) {
      this.removeEventListener(
        'pix3-welcome:project-ready',
        this.onWelcomeProjectReady as EventListener
      );
      this.onWelcomeProjectReady = undefined;
    }
    super.disconnectedCallback();
  }

  protected async firstUpdated(): Promise<void> {
    const host = this.renderRoot.querySelector<HTMLDivElement>('.layout-host');
    if (!host) {
      return;
    }

    // Only initialize the Golden Layout if a project is already opened.
    if (appState.project.status === 'ready') {
      await this.layoutManager.initialize(host);
      this.shellReady = true;
    }

    // Kick off loading of the pending startup scene (first in queue) if any
    const pending = appState.scenes.pendingScenePaths[0];
    if (pending) {
      // Ensure FileSystemAPIService resource prefix logic is available
      // Debug log for startup load
      if (process.env.NODE_ENV === 'development') {
        console.debug('[Pix3Editor] Loading startup scene', { pending });
      }
      await this.loadSceneCommand.execute({ filePath: pending });
    }
  }

  protected render() {
    return html`
      <div class="editor-shell" data-ready=${this.shellReady ? 'true' : 'false'}>
        ${this.renderToolbar()}
        <div class="workspace" role="presentation">
          <div class="layout-host" role="application" aria-busy=${!this.isLayoutReady}></div>
          ${this.isLayoutReady ? html`` : html`<pix3-welcome></pix3-welcome>`}
        </div>
      </div>
    `;
  }

  private renderToolbar() {
    return html`
      <pix3-toolbar aria-label="Editor toolbar">
        <span slot="start" class="product-title" role="heading" aria-level="1"> Pix3 Editor </span>
        <div class="toolbar-content">
          <!-- Layout presets removed: layout defaults to the gameplay engineer configuration -->
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
          aria-label="Reset editor layout"
          ?disabled=${!this.isLayoutReady}
          @click=${this.onLayoutResetRequest}
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

  private onLayoutResetRequest = (): void => {
    void this.layoutManager.resetLayout();
  };

  // Note: project open is handled by <pix3-welcome> to keep shell concerns minimal.

  // layout presets removed; editor uses single default layout
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-editor': Pix3EditorShell;
  }
}
