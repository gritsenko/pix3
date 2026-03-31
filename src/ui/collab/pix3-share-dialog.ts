import { ComponentBase, customElement, html, state } from '@/fw';
import { query } from 'lit/decorators.js';
import { nothing } from 'lit';
import { ServiceContainer } from '@/fw/di';
import { appState } from '@/state';
import { CollaborationService } from '@/services/CollaborationService';
import { CollabSessionService } from '@/services/CollabSessionService';
import './pix3-share-dialog.ts.css';

@customElement('pix3-share-dialog')
export class Pix3ShareDialog extends ComponentBase {
  @state() private isOpen = false;
  @state() private link = '';
  @state() private copyLabel = 'Copy';
  @state() private errorMessage = '';
  @state() private isSharing = false;

  @query('#shareLinkInput') private inputEl!: HTMLInputElement | null;

  public openDialog(): void {
    this.isOpen = true;
    this.copyLabel = 'Copy';
    this.errorMessage = '';
    this.updateLink();
    window.setTimeout(() => this.inputEl?.select(), 50);
  }

  public closeDialog(): void {
    this.isOpen = false;
    this.copyLabel = 'Copy';
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

  private async activateSharing(): Promise<void> {
    this.errorMessage = '';
    this.isSharing = true;

    try {
      const container = ServiceContainer.getInstance();
      const sessionService = container.getService<CollabSessionService>(
        container.getOrCreateToken(CollabSessionService)
      );
      this.link = await sessionService.shareActiveScene();
      this.copyLabel = 'Copy';
      window.setTimeout(() => this.inputEl?.select(), 50);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Failed to start sharing.';
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
      this.copyLabel = 'Copy';
    }, 1400);
  }

  private onOverlayClick(): void {
    this.closeDialog();
  }

  private get isCollabConnected(): boolean {
    const container = ServiceContainer.getInstance();
    const collabService = container.getService<CollaborationService>(
      container.getOrCreateToken(CollaborationService)
    );
    return collabService.isConnected();
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
              ${this.isCollabConnected
                ? 'Sharing is active. Copy the invite link below.'
                : 'Start a live session for the current scene, then send the invite link.'}
            </div>
          </div>
          <div class="pix3-share-body">
            ${this.errorMessage
              ? html`<div class="pix3-share-error">${this.errorMessage}</div>`
              : nothing}
            ${this.isCollabConnected && this.link
              ? html`
                  <input
                    id="shareLinkInput"
                    class="pix3-share-input"
                    .value=${this.link}
                    readonly
                  />
                `
              : html`
                  <div class="pix3-share-empty">
                    ${appState.project.id && appState.scenes.activeSceneId
                      ? 'Scene sharing is not active yet.'
                      : 'Open a project and scene to enable sharing.'}
                  </div>
                `}
          </div>
          <div class="pix3-share-actions">
            <button
              class="pix3-share-button pix3-share-button--primary"
              @click=${this.activateSharing}
              ?disabled=${this.isSharing || !appState.project.id || !appState.scenes.activeSceneId}
            >
              ${this.isSharing
                ? 'Connecting...'
                : this.isCollabConnected
                  ? 'Refresh Link'
                  : 'Share'}
            </button>
            <button
              class="pix3-share-button"
              @click=${this.copyLink}
              ?disabled=${!this.isCollabConnected || !this.link}
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
