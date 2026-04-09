import { ComponentBase, customElement, html, inject, state, subscribe } from '@/fw';
import './pix3-welcome.ts.css';
import { ProjectService } from '@/services';
import { IconService } from '@/services/IconService';
import { CloudProjectService } from '@/services/CloudProjectService';
import type { ApiProject } from '@/services/ApiClient';
import { appState } from '@/state';
import type { RecentProjectEntry } from '@/services/ProjectService';
import { ProjectLifecycleService } from '@/services/ProjectLifecycleService';
import { CURRENT_EDITOR_VERSION } from '@/version';

@customElement('pix3-welcome')
export class Pix3Welcome extends ComponentBase {
  @inject(ProjectService)
  private readonly projectService!: ProjectService;

  @inject(IconService)
  private readonly iconService!: IconService;

  @inject(CloudProjectService)
  private readonly cloudProjectService!: CloudProjectService;

  @inject(ProjectLifecycleService)
  private readonly projectLifecycleService!: ProjectLifecycleService;

  @state()
  private recents: RecentProjectEntry[] = [];

  @state()
  private cloudProjects: ApiProject[] = [];

  @state()
  private cloudProjectsLoading = false;

  @state()
  private isAuthenticated = appState.auth.isAuthenticated;

  protected firstUpdated(): void {
    Promise.resolve().then(() => {
      this.loadRecents();
      this.loadCloudProjects();
    });
  }

  private disposeCloudSubscription?: () => void;
  private disposeProjectSubscription?: () => void;
  private disposeAuthSubscription?: () => void;

  connectedCallback(): void {
    super.connectedCallback();
    this.disposeCloudSubscription = this.cloudProjectService.subscribe(state => {
      this.cloudProjects = state.projects;
      this.cloudProjectsLoading = state.isLoading;
    });
    this.disposeAuthSubscription = subscribe(appState.auth, () => {
      this.isAuthenticated = appState.auth.isAuthenticated;
      this.loadCloudProjects();
      this.requestUpdate();
    });
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
    this.disposeCloudSubscription?.();
    this.disposeCloudSubscription = undefined;
    this.disposeAuthSubscription?.();
    this.disposeAuthSubscription = undefined;
    this.disposeProjectSubscription?.();
    this.disposeProjectSubscription = undefined;
    super.disconnectedCallback();
    // No DOM restore needed; shell will handle cleanup.
  }

  private loadRecents(): void {
    this.recents = this.projectService?.getRecentProjects?.() ?? [];
  }

  private loadCloudProjects(): void {
    void this.cloudProjectService.loadProjects();
  }

  private onOpen = async (): Promise<void> => {
    await this.projectService.openProjectViaPicker();
  };

  private onStartNew = async (): Promise<void> => {
    try {
      await this.projectLifecycleService.showCreateDialog();
    } catch (error) {
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

    if (entry.backend === 'cloud' && !this.isAuthenticated) {
      this.requestAuth({
        projectId: entry.id ?? null,
        source: 'recent-cloud',
      });
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

  private onCloudProject = async (e: Event): Promise<void> => {
    const btn = e.currentTarget as HTMLElement | null;
    if (!btn) return;
    const projectId = btn.getAttribute('data-cloud-id');
    if (!projectId) return;

    if (!this.isAuthenticated) {
      this.requestAuth({
        projectId,
        source: 'cloud-list',
      });
      return;
    }

    await this.cloudProjectService.openProject(projectId);
  };

  private requestAuth(detail: { projectId: string | null; source: 'recent-cloud' | 'cloud-list' }) {
    this.dispatchEvent(
      new CustomEvent('pix3-auth:request', {
        detail,
        bubbles: true,
        composed: true,
      })
    );
  }

  private getProjectBadgeLabel(entry: RecentProjectEntry): string {
    if (entry.linkedCloudProjectId || entry.linkedLocalSessionId) {
      return 'Hybrid';
    }

    return entry.backend === 'cloud' ? 'Cloud' : 'Local';
  }

  private getProjectBadgeClass(entry: RecentProjectEntry): string {
    return entry.linkedCloudProjectId || entry.linkedLocalSessionId
      ? 'recent-backend recent-backend--hybrid'
      : 'recent-backend';
  }

  private getProjectIcon(entry: RecentProjectEntry) {
    return this.iconService.getIcon(
      entry.backend === 'cloud' ? 'cloud-outline' : 'folder-outline',
      18
    );
  }

  protected render() {
    return html`
      <div class="welcome-root" role="region" aria-label="Welcome">
        <div class="welcome-card">
          <div class="welcome-header">
            <img src="/splash-logo.png" alt="Pix3" class="welcome-logo" />
            <div class="welcome-version">${CURRENT_EDITOR_VERSION.displayVersion}</div>
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
                <span class="action-icon"
                  >${this.iconService.getIcon('plus-circle-outline', 20)}</span
                >
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
                            <span class="folder-icon" aria-hidden="true"
                              >${this.getProjectIcon(r)}</span
                            >
                            <span class="recent-name">${r.name}</span>
                            <span class=${this.getProjectBadgeClass(r)}
                              >${this.getProjectBadgeLabel(r)}</span
                            >
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
          ${this.isAuthenticated && this.cloudProjects.length
            ? html`<div class="recent-list cloud-list">
                <h3>Cloud Projects</h3>
                <ul>
                  ${this.cloudProjects.map(
                    p =>
                      html`<li>
                        <button
                          class="recent-item"
                          data-cloud-id="${p.id}"
                          @click=${this.onCloudProject}
                        >
                          <span class="folder-icon" aria-hidden="true"
                            >${this.iconService.getIcon('cloud-outline', 18)}</span
                          >
                          <span class="recent-name">${p.name}</span>
                          <span class="recent-backend">Cloud</span>
                          <span class="recent-time"
                            >${this.formatTime(new Date(p.updated_at).getTime())}</span
                          >
                        </button>
                      </li>`
                  )}
                </ul>
              </div>`
            : null}
          ${this.isAuthenticated && this.cloudProjectsLoading && this.cloudProjects.length === 0
            ? html`<div class="recent-list cloud-list">
                <h3>Cloud Projects</h3>
                <div class="recent-empty">Loading cloud projects...</div>
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
