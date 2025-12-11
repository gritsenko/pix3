import { ComponentBase, customElement, html, property } from '@/fw';
import './pix3-confirm-dialog.ts.css';

@customElement('pix3-confirm-dialog')
export class ConfirmDialog extends ComponentBase {
  @property({ type: String, reflect: true })
  public dialogId: string = '';

  @property({ type: String, reflect: true })
  public title: string = '';

  @property({ type: String, reflect: true })
  public message: string = '';

  @property({ type: String, reflect: true })
  public confirmLabel: string = 'Confirm';

  @property({ type: String, reflect: true })
  public cancelLabel: string = 'Cancel';

  @property({ type: Boolean, reflect: true })
  public isDangerous: boolean = false;

  protected render() {
    return html`
      <div
        class="dialog-backdrop"
        @click=${this.onBackdropClick}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === 'Escape') this.dispatchCancel();
        }}
      >
        <div
          class="dialog-content"
          @click=${(e: Event) => e.stopPropagation()}
          @keydown=${() => {}}
        >
          <h2 class="dialog-title">${this.title}</h2>
          <p class="dialog-message">${this.message}</p>
          <div class="dialog-actions">
            <button class="btn-cancel" @click=${() => this.dispatchCancel()}>
              ${this.cancelLabel}
            </button>
            <button
              class="btn-confirm ${this.isDangerous ? 'dangerous' : ''}"
              @click=${() => this.dispatchConfirm()}
            >
              ${this.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private onBackdropClick(): void {
    this.dispatchCancel();
  }

  private dispatchConfirm(): void {
    this.dispatchEvent(
      new CustomEvent('dialog-confirmed', {
        detail: { dialogId: this.dialogId },
        bubbles: true,
        composed: true,
      })
    );
  }

  private dispatchCancel(): void {
    this.dispatchEvent(
      new CustomEvent('dialog-cancelled', {
        detail: { dialogId: this.dialogId },
        bubbles: true,
        composed: true,
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-confirm-dialog': ConfirmDialog;
  }
}
