import { ComponentBase, customElement, html, inject, state, subscribe } from '@/fw';
import './pix3-welcome.ts.css';
import { ProjectService } from '../../services';
import { appState } from '../../state';

@customElement('pix3-welcome')
export class Pix3Welcome extends ComponentBase {
  @inject(ProjectService)
  private readonly projectService!: ProjectService;

  @state()
  private recents: { id?: string; name: string; lastOpenedAt: number }[] = [];

  protected firstUpdated(): void {
    this.loadRecents();
  }

  private disposeProjectSubscription?: () => void;

  connectedCallback(): void {
    super.connectedCallback();
    // subscribe to project state: reload recents and auto-remove the welcome overlay when project is ready
    this.disposeProjectSubscription = subscribe(appState.project, () => {
      try {
        this.loadRecents();
        if (appState.project.status === 'ready') {
          // Notify host/shell that project is ready so it can remove the welcome component
          try {
            this.dispatchEvent(
              new CustomEvent('pix3-welcome:project-ready', { bubbles: true, composed: true })
            );
          } catch {
            // ignore dispatch errors
          }
        }
      } catch {
        // ignore errors during UI cleanup
      }
    });
    // Note: component no longer moves itself in the DOM; the shell/host should
    // listen for the 'pix3-welcome:project-ready' event and remove the element.
  }

  disconnectedCallback(): void {
    // dispose subscription first
    this.disposeProjectSubscription?.();
    this.disposeProjectSubscription = undefined;
    super.disconnectedCallback();
    // No DOM restore needed; shell will handle cleanup.
  }

  private loadRecents(): void {
    this.recents = this.projectService?.getRecentProjects?.() ?? [];
  }

  private onOpen = async (): Promise<void> => {
    await this.projectService.openProjectViaPicker();
  };

  private onRecent = async (e: Event): Promise<void> => {
    const btn = e.currentTarget as HTMLElement | null;
    if (!btn) return;
    const idxAttr = btn.getAttribute('data-recent-index');
    const idx = idxAttr ? Number(idxAttr) : NaN;
    if (!Number.isFinite(idx)) {
      await this.onOpen();
      return;
    }
    const entry = this.recents[idx];
    if (!entry) {
      await this.onOpen();
      return;
    }
    await this.projectService.openRecentProject(entry);
  };

  private formatTime(ts: number): string {
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return '';
    }
  }

  private onRemoveRecent = async (e: Event): Promise<void> => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLElement | null;
    if (!btn) return;
    const idxAttr = btn.getAttribute('data-recent-index');
    const idx = idxAttr ? Number(idxAttr) : NaN;
    if (!Number.isFinite(idx)) return;
    const entry = this.recents[idx];
    if (!entry) return;
    try {
      this.projectService.removeRecentProject({ id: entry.id, name: entry.name });
    } catch {
      // ignore removal errors
    }
    this.loadRecents();
  };

  private crossSvg() {
    return html`<svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M11 1L1 11"
        stroke="#CBD5E1"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M1 1L11 11"
        stroke="#CBD5E1"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>`;
  }

  protected render() {
    return html`
      <div class="welcome-root" role="region" aria-label="Welcome">
        <div class="welcome-card">
          <h2>Welcome to Pix3</h2>
          <p>Open a project folder to get started.</p>
          <div class="welcome-actions">
            <button @click=${this.onOpen} class="open-btn">Open folder</button>
          </div>

          ${this.recents.length
            ? html`<div class="recent-list">
                <h3>Recent Projects</h3>
                <ul>
                  ${this.recents.map(
                    (r, i) =>
                      html`<li>
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                          <button
                            class="recent-item"
                            data-recent-index="${i}"
                            @click=${this.onRecent}
                          >
                            <span class="folder-icon" aria-hidden="true">${this.folderSvg()}</span>
                            <span class="recent-name">${r.name}</span>
                            <span class="recent-time">${this.formatTime(r.lastOpenedAt)}</span>
                          </button>
                          <button
                            class="recent-remove"
                            title="Remove from recent"
                            data-recent-index="${i}"
                            @click=${this.onRemoveRecent}
                            aria-label="Remove recent"
                          >
                            ${this.crossSvg()}
                          </button>
                        </div>
                      </li>`
                  )}
                </ul>
              </div>`
            : null}
        </div>
      </div>
    `;
  }

  private folderSvg() {
    return html`<svg
      width="18"
      height="14"
      viewBox="0 0 18 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M1 3.5C1 2.67157 1.67157 2 2.5 2H6.5L8 4H15.5C16.3284 4 17 4.67157 17 5.5V11.5C17 12.3284 16.3284 13 15.5 13H2.5C1.67157 13 1 12.3284 1 11.5V3.5Z"
        fill="#9AA4B2"
      />
    </svg>`;
  }

  // Styles moved to external CSS file (pix3-welcome.ts.css) and imported
  // at module top so bundlers can include the stylesheet. Kept `css` import
  // in case other components rely on it.
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-welcome': Pix3Welcome;
  }
}
