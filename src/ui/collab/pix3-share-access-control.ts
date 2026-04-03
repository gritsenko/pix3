import { ComponentBase, customElement, html, inject, state } from '@/fw';
import { subscribe } from 'valtio/vanilla';
import { appState } from '@/state';
import { CloudProjectService } from '@/services/CloudProjectService';
import { CollabSessionService } from '@/services/CollabSessionService';
import './pix3-share-access-control.ts.css';

@customElement('pix3-share-access-control')
export class Pix3ShareAccessControl extends ComponentBase {
  @inject(CloudProjectService)
  private readonly cloudProjectService!: CloudProjectService;

  @inject(CollabSessionService)
  private readonly collabSessionService!: CollabSessionService;

  @state() private projectId: string | null = appState.project.id;
  @state() private activeSceneId: string | null = appState.scenes.activeSceneId;
  @state() private isCloudProject = appState.project.backend === 'cloud';
  @state() private shareEnabled = appState.collaboration.shareEnabled;
  @state() private projectRole = appState.collaboration.role;
  @state() private isBusy = false;
  @state() private copyLabel = 'Copy link';

  private disposeProjectSubscription?: () => void;
  private disposeScenesSubscription?: () => void;
  private disposeCollabSubscription?: () => void;

  connectedCallback(): void {
    super.connectedCallback();

    this.disposeProjectSubscription = subscribe(appState.project, () => {
      this.projectId = appState.project.id;
      this.isCloudProject = appState.project.backend === 'cloud';
    });
    this.disposeScenesSubscription = subscribe(appState.scenes, () => {
      this.activeSceneId = appState.scenes.activeSceneId;
    });
    this.disposeCollabSubscription = subscribe(appState.collaboration, () => {
      this.shareEnabled = appState.collaboration.shareEnabled;
      this.projectRole = appState.collaboration.role;
    });
  }

  disconnectedCallback(): void {
    this.disposeProjectSubscription?.();
    this.disposeScenesSubscription?.();
    this.disposeCollabSubscription?.();
    super.disconnectedCallback();
  }

  private get canManageSharing(): boolean {
    return this.projectRole === 'owner' || this.projectRole === 'editor';
  }

  private get shareMode(): 'private' | 'link' {
    return this.shareEnabled ? 'link' : 'private';
  }

  private async onShareModeChange(event: Event): Promise<void> {
    const target = event.target as HTMLSelectElement;
    const nextMode = target.value as 'private' | 'link';
    if (!this.projectId || !this.canManageSharing || this.isBusy || nextMode === this.shareMode) {
      return;
    }

    this.isBusy = true;
    try {
      if (nextMode === 'link') {
        await this.cloudProjectService.generateShareToken(this.projectId);
        appState.collaboration.shareEnabled = true;
      } else {
        await this.cloudProjectService.revokeShareToken(this.projectId);
        appState.collaboration.shareEnabled = false;
      }
    } finally {
      this.isBusy = false;
    }
  }

  private async copyLink(): Promise<void> {
    if (!this.projectId || !this.activeSceneId || !this.canManageSharing || this.isBusy) {
      return;
    }

    this.isBusy = true;
    try {
      const shareToken = await this.cloudProjectService.generateShareToken(this.projectId);
      appState.collaboration.shareEnabled = true;
      const link = this.collabSessionService.buildInviteLink(
        this.projectId,
        this.activeSceneId,
        shareToken
      );
      await navigator.clipboard.writeText(link);
      this.copyLabel = 'Copied';
      window.setTimeout(() => {
        this.copyLabel = 'Copy link';
      }, 1600);
    } finally {
      this.isBusy = false;
    }
  }

  protected render() {
    if (!this.isCloudProject || !this.projectId) {
      return html``;
    }

    const disabled = !this.canManageSharing || this.isBusy;

    return html`
      <div class="share-access-control">
        <span class="share-access-control__label">Shared for</span>
        <select
          class="share-access-control__select"
          .value=${this.shareMode}
          ?disabled=${disabled}
          @change=${(event: Event) => void this.onShareModeChange(event)}
        >
          <option value="private">Only me</option>
          <option value="link">Any user with the link</option>
        </select>
        ${this.shareMode === 'link'
          ? html`
              <select class="share-access-control__select" .value=${'edit'} disabled>
                <option value="edit">Can edit</option>
              </select>
              <button
                class="share-access-control__copy"
                ?disabled=${disabled || !this.activeSceneId}
                @click=${() => void this.copyLink()}
              >
                ${this.isBusy ? 'Working...' : this.copyLabel}
              </button>
            `
          : null}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-share-access-control': Pix3ShareAccessControl;
  }
}
