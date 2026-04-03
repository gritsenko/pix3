import { ComponentBase, customElement, html, state } from '@/fw';
import { query } from 'lit/decorators.js';
import { nothing } from 'lit';
import { ServiceContainer } from '@/fw/di';
import { appState } from '@/state';
import { CollabSessionService } from '@/services/CollabSessionService';
import { CloudProjectService } from '@/services/CloudProjectService';
import './pix3-share-dialog.ts.css';

@customElement('pix3-share-dialog')
export class Pix3ShareDialog extends ComponentBase {
  @state() private isOpen = false;
  @state() private link = '';
  @state() private copyLabel = 'Copy link';
  @state() private errorMessage = '';
  @state() private isSharing = false;
  @state()
  private shareMode: 'private' | 'link' = appState.collaboration.shareEnabled ? 'link' : 'private';

  @query('#shareLinkInput') private inputEl!: HTMLInputElement | null;

  public openDialog(): void {
    this.isOpen = true;
    this.copyLabel = 'Copy link';
    this.errorMessage = '';
    this.shareMode = appState.collaboration.shareEnabled ? 'link' : 'private';
    this.updateLink();
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

  protected render() {
    if (!this.isOpen) {
      return nothing;
    }

    return html`
      <div class="pix3-share-overlay" @click=${this.onOverlayClick}>
        <div class="pix3-share-dialog" @click=${(event: Event) => event.stopPropagation()}>
          <div class="pix3-share-header">
            <div class="pix3-share-title">Share Project</div>
            <div class="pix3-share-subtitle">Manage link access for this cloud project.</div>
          </div>
          <div class="pix3-share-body">
            ${this.errorMessage
              ? html`<div class="pix3-share-error">${this.errorMessage}</div>`
              : nothing}
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
                    <label class="pix3-share-field-label" for="accessModeSelect">Access</label>
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
                    Anyone with the link can open the project. Editing still requires membership.
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
          <div class="pix3-share-actions">
            <button
              class="pix3-share-button"
              @click=${this.copyLink}
              ?disabled=${this.shareMode !== 'link' || !this.link}
            >
              ${this.copyLabel}
            </button>
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
