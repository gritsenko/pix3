import { ComponentBase, customElement, html, state } from '@/fw';
import { subscribe } from 'valtio/vanilla';
import { appState } from '@/state';
import type { CollabRemoteUser } from '@/state/AppState';
import './collab-participants-strip.ts.css';

interface ParticipantDisplay {
  key: string;
  name: string;
  color: string;
  initials: string;
}

@customElement('collab-participants-strip')
export class CollabParticipantsStrip extends ComponentBase {
  @state() private remoteUsers: CollabRemoteUser[] = [...appState.collaboration.remoteUsers];
  @state() private accessMode = appState.collaboration.accessMode;

  private disposeCollabSubscription?: () => void;

  connectedCallback(): void {
    super.connectedCallback();
    this.disposeCollabSubscription = subscribe(appState.collaboration, () => {
      this.remoteUsers = [...appState.collaboration.remoteUsers];
      this.accessMode = appState.collaboration.accessMode;
    });
  }

  disconnectedCallback(): void {
    this.disposeCollabSubscription?.();
    super.disconnectedCallback();
  }

  protected render() {
    const participants = this.getParticipants();
    if (this.accessMode === 'local' || participants.length === 0) {
      return html``;
    }

    return html`
      <div class="participants-strip" aria-label="Connected participants">
        <span class="participants-strip__divider" aria-hidden="true"></span>
        ${participants.map(
          participant => html`
            <div
              class="participants-strip__chip"
              title=${participant.name}
              aria-label=${participant.name}
            >
              <span class="participants-strip__avatar" style=${`background:${participant.color};`}>
                ${participant.initials}
              </span>
            </div>
          `
        )}
      </div>
    `;
  }

  private getParticipants(): ParticipantDisplay[] {
    const participants: ParticipantDisplay[] = [];

    for (const user of this.remoteUsers) {
      participants.push({
        key: `remote:${user.clientId}`,
        name: user.name,
        color: user.color,
        initials: this.getInitials(user.name),
      });
    }

    return participants;
  }

  private getInitials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (words.length === 0) {
      return '?';
    }

    return words.map(word => word.charAt(0).toUpperCase()).join('');
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'collab-participants-strip': CollabParticipantsStrip;
  }
}
