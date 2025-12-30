import { ComponentBase, customElement, html, inject, state, subscribe } from '@/fw';
import './pix3-welcome.ts.css';
import { ProjectService } from '@/services';
import { IconService } from '@/services/IconService';
import { appState } from '@/state';

@customElement('pix3-welcome')
export class Pix3Welcome extends ComponentBase {
  @inject(ProjectService)
  private readonly projectService!: ProjectService;

  @inject(IconService)
  private readonly iconService!: IconService;

  @state()
  private recents: { id?: string; name: string; lastOpenedAt: number }[] = [];

  protected firstUpdated(): void {
    // Avoid mutating reactive properties synchronously during the update
    // lifecycle (which causes Lit's "scheduled an update after an update
    // completed" warning). Schedule the load on a microtask so it runs
    // after the current update completes.
    Promise.resolve().then(() => this.loadRecents());
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

  private onStartNew = async (): Promise<void> => {
    try {
      await this.projectService.createNewProject();
    } catch (error) {
      // Show alert for errors (like non-empty directory)
      if (error instanceof Error) {
        alert(error.message);
      } else {
        alert('Failed to create new project');
      }
    }
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

  protected render() {
    return html`
      <div class="welcome-root" role="region" aria-label="Welcome">
        <div class="welcome-card">
          <div class="welcome-header">
            <img src="/splash-logo.png" alt="Pix3" class="welcome-logo" />
          </div>

          <div class="welcome-actions-grid">
            <div class="action-column">
              <button @click=${this.onOpen} class="action-btn">
                <span class="action-icon">${this.iconService.getIcon('folder-outline', 18)}</span>
                <span class="action-label">Open Project</span>
              </button>
            </div>
            <div class="action-column">
              <button @click=${this.onStartNew} class="action-btn">
                <span class="action-icon">${this.iconService.getIcon('plus-circle-outline', 20)}</span>
                <span class="action-label">Start New Project</span>
              </button>
            </div>
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
                            <span class="folder-icon" aria-hidden="true">${this.iconService.getIcon('folder-outline', 18)}</span>
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
                            ${this.iconService.getIcon('x-close', 12)}
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

  // Styles moved to external CSS file (pix3-welcome.ts.css) and imported
  // at module top so bundlers can include the stylesheet. Kept `css` import
  // in case other components rely on it.
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-welcome': Pix3Welcome;
  }
}
