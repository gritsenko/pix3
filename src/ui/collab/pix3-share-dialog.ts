import { ComponentBase, customElement, html, inject, state } from '@/fw';
import { query } from 'lit/decorators.js';
import { nothing } from 'lit';
import { ServiceContainer } from '@/fw/di';
import { appState } from '@/state';
import { CollabSessionService } from '@/services/CollabSessionService';
import { CloudProjectService } from '@/services/CloudProjectService';
import { LocalSyncService } from '@/services/LocalSyncService';
import { subscribe } from 'valtio/vanilla';
import './pix3-share-dialog.ts.css';

@customElement('pix3-share-dialog')
export class Pix3ShareDialog extends ComponentBase {
  @inject(LocalSyncService)
  private readonly localSyncService!: LocalSyncService;

  @state() private isOpen = false;
  @state() private link = '';
  @state() private copyLabel = 'Copy link';
  @state() private errorMessage = '';
  @state() private isSharing = false;
  @state() private isSyncing = false;
  @state()
  private shareMode: 'private' | 'link' = appState.collaboration.shareEnabled ? 'link' : 'private';

  @query('#shareLinkInput') private inputEl!: HTMLInputElement | null;

  private disposeProjectSubscription?: () => void;

  connectedCallback(): void {
    super.connectedCallback();
    this.disposeProjectSubscription = subscribe(appState.project, () => {
      this.requestUpdate();
    });
  }

  disconnectedCallback(): void {
    this.disposeProjectSubscription?.();
    this.disposeProjectSubscription = undefined;
    super.disconnectedCallback();
  }

  public openDialog(): void {
    this.isOpen = true;
    this.copyLabel = 'Copy link';
    this.errorMessage = '';
    this.shareMode = appState.collaboration.shareEnabled ? 'link' : 'private';
    this.updateLink();
    void this.localSyncService.refreshCurrentProjectStatus().finally(() => this.requestUpdate());
    window.setTimeout(() => this.inputEl?.select(), 50);
  }

  public closeDialog(): void {
    this.isOpen = false;
    this.copyLabel = 'Copy link';
    this.errorMessage = '';
  }

  private updateLink(): void {
    const projectId = appState.project.id;
    const sceneId = appState.scenes.activeSceneId;

    if (!projectId || !sceneId) {
      this.link = '';
      return;
    }

    const container = ServiceContainer.getInstance();
    const sessionService = container.getService<CollabSessionService>(
      container.getOrCreateToken(CollabSessionService)
    );
    this.link = sessionService.buildInviteLink(projectId, sceneId);
  }

  private buildLinkFromShareToken(shareToken?: string): string {
    const projectId = appState.project.id;
    const sceneId = appState.scenes.activeSceneId;
    if (!projectId || !sceneId) {
      return '';
    }

    const container = ServiceContainer.getInstance();
    const sessionService = container.getService<CollabSessionService>(
      container.getOrCreateToken(CollabSessionService)
    );
    return sessionService.buildInviteLink(projectId, sceneId, shareToken);
  }

  private get canManageSharing(): boolean {
    return appState.collaboration.role === 'owner' || appState.collaboration.role === 'editor';
  }

  private async onShareModeChange(event: Event): Promise<void> {
    const target = event.target as HTMLSelectElement;
    const nextMode = target.value as 'private' | 'link';
    if (!appState.project.id || nextMode === this.shareMode || !this.canManageSharing) {
      return;
    }

    this.errorMessage = '';
    this.isSharing = true;

    try {
      const container = ServiceContainer.getInstance();
      const cloudProjectService = container.getService<CloudProjectService>(
        container.getOrCreateToken(CloudProjectService)
      );

      if (nextMode === 'link') {
        if (!appState.scenes.activeSceneId) {
          throw new Error('Open a scene before enabling link sharing.');
        }
        const shareToken = await cloudProjectService.generateShareToken(appState.project.id);
        this.link = this.buildLinkFromShareToken(shareToken);
      } else {
        await cloudProjectService.revokeShareToken(appState.project.id);
        this.link = '';
      }
      this.shareMode = nextMode;
      this.copyLabel = 'Copy link';
      window.setTimeout(() => this.inputEl?.select(), 50);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Failed to update link sharing.';
    } finally {
      this.isSharing = false;
    }
  }

  private async copyLink(): Promise<void> {
    if (!this.link) {
      return;
    }

    let copied = false;

    try {
      await navigator.clipboard.writeText(this.link);
      copied = true;
    } catch {
      if (this.inputEl) {
        this.inputEl.select();
        try {
          copied = document.execCommand('copy');
        } catch {
          copied = false;
        }
      }
    }

    this.copyLabel = copied ? 'Copied' : 'Copy failed';
    window.setTimeout(() => {
      this.copyLabel = 'Copy link';
    }, 1400);
  }

  private onOverlayClick(): void {
    this.closeDialog();
  }

  private requestAuthentication(): void {
    this.dispatchEvent(
      new CustomEvent('pix3-auth:request', {
        detail: {
          projectId: null,
        },
        bubbles: true,
        composed: true,
      })
    );
  }

  private get syncStatusLabel(): string {
    switch (appState.project.hybridSync.status) {
      case 'checking':
        return 'Checking sync status';
      case 'up-to-date':
        return 'Up to date';
      case 'local-changes':
        return 'Local folder changed';
      case 'cloud-changes':
        return 'Cloud project changed';
      case 'conflict':
        return 'Sync conflict';
      case 'syncing':
        return 'Syncing';
      case 'auth-required':
        return 'Sign in required';
      case 'error':
        return 'Sync needs attention';
      default:
        return 'Not linked';
    }
  }

  private get syncHint(): string {
    const { hybridSync } = appState.project;
    if (hybridSync.errorMessage) {
      return hybridSync.errorMessage;
    }

    switch (hybridSync.status) {
      case 'up-to-date':
        return hybridSync.lastSyncAt
          ? `Last sync: ${new Date(hybridSync.lastSyncAt).toLocaleString()}`
          : 'Local folder and cloud project match.';
      case 'local-changes':
        return `${hybridSync.localChangeCount} local file change(s) are ready to upload.`;
      case 'cloud-changes':
        return `${hybridSync.cloudChangeCount} cloud file change(s) are ready to download.`;
      case 'conflict':
        return `${hybridSync.conflictCount} file(s) changed on both sides since the last sync.`;
      case 'auth-required':
        return 'Open your account to compare and sync with the cloud project.';
      case 'checking':
        return 'Scanning the local folder and cloud manifest.';
      case 'syncing':
        return 'Applying file updates between the linked folder and cloud project.';
      case 'error':
        return 'Reconnect the link or rerun sync to recover.';
      default:
        return appState.project.backend === 'local'
          ? 'Create a cloud copy of this local project and keep both sides in sync.'
          : 'Download this cloud project into a linked local folder for Git and external tools.';
    }
  }

  private get syncProgressLabel(): string | null {
    const { processedFileCount, totalFileCount, status } = appState.project.hybridSync;
    if (status !== 'syncing' || totalFileCount <= 0) {
      return null;
    }

    return `Processed ${processedFileCount}/${totalFileCount} files`;
  }

  private get syncPrimaryActionLabel(): string {
    if (appState.project.backend === 'local') {
      return appState.project.hybridSync.linkedCloudProjectId ? 'Sync Changes' : 'Sync to Cloud';
    }

    if (appState.project.hybridSync.linkedLocalSessionId) {
      return appState.project.hybridSync.status === 'error' ? 'Reconnect Folder' : 'Sync Changes';
    }

    return 'Sync to Local Folder';
  }

  private async handleSyncAction(): Promise<void> {
    if (appState.project.backend === 'local' && !appState.auth.isAuthenticated) {
      this.requestAuthentication();
      return;
    }

    this.errorMessage = '';
    this.isSyncing = true;
    try {
      if (appState.project.backend === 'local') {
        if (appState.project.hybridSync.linkedCloudProjectId) {
          await this.localSyncService.syncCurrentProject();
        } else {
          await this.localSyncService.syncCurrentLocalProjectToCloud();
        }
      } else if (
        appState.project.hybridSync.linkedLocalSessionId &&
        appState.project.hybridSync.status !== 'error'
      ) {
        await this.localSyncService.syncCurrentProject();
      } else {
        await this.localSyncService.syncCurrentCloudProjectToLocalFolder();
      }
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Failed to synchronize project.';
    } finally {
      this.isSyncing = false;
    }
  }

  private renderSyncIssues() {
    const issues = appState.project.hybridSync.issues;
    if (issues.length === 0) {
      return nothing;
    }

    return html`
      <div class="pix3-share-issues">
        <div class="pix3-share-issues__title">Problems</div>
        <ul class="pix3-share-issues__list">
          ${issues.map(
            issue => html`
              <li class="pix3-share-issues__item">
                <div class="pix3-share-issues__path">${issue.path}</div>
                <div class="pix3-share-issues__reason">${issue.reason}</div>
              </li>
            `
          )}
        </ul>
      </div>
    `;
  }

  private renderSyncSection() {
    const hasLink = Boolean(
      appState.project.backend === 'local'
        ? appState.project.hybridSync.linkedCloudProjectId
        : appState.project.hybridSync.linkedLocalSessionId
    );
    const linkedTarget =
      appState.project.backend === 'local'
        ? appState.project.hybridSync.linkedCloudProjectId
        : (appState.project.hybridSync.linkedLocalPath ??
          appState.project.hybridSync.linkedLocalSessionId);

    return html`
      <div class="pix3-share-section">
        <div class="pix3-share-section__header">
          <div class="pix3-share-section__title">Sync</div>
          <div class="pix3-share-section__badge">${this.syncStatusLabel}</div>
        </div>
        ${hasLink && linkedTarget
          ? html`<div class="pix3-share-linkage">Linked to ${linkedTarget}</div>`
          : nothing}
        <div class="pix3-share-hint">${this.syncHint}</div>
        <div class="pix3-share-actions pix3-share-actions--inline">
          <button
            class="pix3-share-button pix3-share-button--primary"
            @click=${() => void this.handleSyncAction()}
            ?disabled=${this.isSyncing || this.isSharing || appState.project.status !== 'ready'}
          >
            ${this.isSyncing ? 'Working...' : this.syncPrimaryActionLabel}
          </button>
          ${this.syncProgressLabel
            ? html`<div class="pix3-share-progress">${this.syncProgressLabel}</div>`
            : nothing}
        </div>
        ${this.renderSyncIssues()}
      </div>
    `;
  }

  protected render() {
    if (!this.isOpen) {
      return nothing;
    }

    return html`
      <div class="pix3-share-overlay" @click=${this.onOverlayClick}>
        <div class="pix3-share-dialog" @click=${(event: Event) => event.stopPropagation()}>
          <div class="pix3-share-header">
            <div class="pix3-share-title">Share Project</div>
            <div class="pix3-share-subtitle">
              ${appState.project.backend === 'local'
                ? 'Link this local folder with a cloud project and keep both copies synchronized.'
                : 'Manage cloud sharing and linked local-folder synchronization.'}
            </div>
          </div>
          <div class="pix3-share-body">
            ${this.errorMessage
              ? html`<div class="pix3-share-error">${this.errorMessage}</div>`
              : nothing}
            ${this.renderSyncSection()}
            ${appState.project.backend === 'cloud'
              ? html`
                  <div class="pix3-share-section">
                    <div class="pix3-share-section__header">
                      <div class="pix3-share-section__title">Share Access</div>
                    </div>
                    <div class="pix3-share-row">
                      <label class="pix3-share-field-label" for="sharedForSelect">Shared for</label>
                      <select
                        id="sharedForSelect"
                        class="pix3-share-select"
                        .value=${this.shareMode}
                        ?disabled=${this.isSharing || !this.canManageSharing}
                        @change=${(event: Event) => void this.onShareModeChange(event)}
                      >
                        <option value="private">Only me</option>
                        <option value="link">Any user with the link</option>
                      </select>
                    </div>
                    ${this.shareMode === 'link'
                      ? html`
                          <div class="pix3-share-row">
                            <label class="pix3-share-field-label" for="accessModeSelect"
                              >Access</label
                            >
                            <select id="accessModeSelect" class="pix3-share-select" disabled>
                              <option selected>Can edit</option>
                            </select>
                          </div>
                          <input
                            id="shareLinkInput"
                            class="pix3-share-input"
                            .value=${this.link}
                            readonly
                          />
                          <div class="pix3-share-hint">
                            Anyone with the link can open the project. Editing still requires
                            membership.
                          </div>
                        `
                      : html`
                          <div class="pix3-share-empty">
                            ${appState.project.id
                              ? 'Only project members can access this workspace right now.'
                              : 'Open a cloud project to manage sharing.'}
                          </div>
                        `}
                  </div>
                `
              : nothing}
          </div>
          <div class="pix3-share-actions">
            ${appState.project.backend === 'cloud'
              ? html`
                  <button
                    class="pix3-share-button"
                    @click=${this.copyLink}
                    ?disabled=${this.shareMode !== 'link' || !this.link}
                  >
                    ${this.copyLabel}
                  </button>
                `
              : nothing}
            <button class="pix3-share-button" @click=${this.closeDialog}>Close</button>
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-share-dialog': Pix3ShareDialog;
  }
}
