import { ComponentBase, customElement, html, inject, property } from '@/fw';
import { FocusRingService } from '@/services/FocusRingService';
import './pix3-toolbar.ts.css';

@customElement('pix3-toolbar')
export class Pix3Toolbar extends ComponentBase {
  @property({ attribute: 'aria-label' })
  label = 'Editor toolbar';

  @property({ type: Boolean, reflect: true })
  dense = false;

  @inject(FocusRingService)
  private readonly focusRing!: FocusRingService;

  private cleanupActions?: () => void;

  disconnectedCallback(): void {
    this.cleanupActions?.();
    this.cleanupActions = undefined;
    super.disconnectedCallback();
  }

  protected firstUpdated(): void {
    this.ensureActionsFocusGroup();
  }

  protected updated(): void {
    this.ensureActionsFocusGroup();
  }

  private ensureActionsFocusGroup(): void {
    if (this.cleanupActions) {
      return;
    }

    const root = (this.renderRoot as HTMLElement) ?? this;
    const actionsHost = root.querySelector<HTMLElement>('[data-toolbar-actions]');
    if (!actionsHost) {
      return;
    }

    this.cleanupActions = this.focusRing.attachRovingFocus(actionsHost, {
      selector: 'pix3-toolbar-button:not([disabled])',
      orientation: 'horizontal',
      focusFirstOnInit: false,
    });
  }

  protected render() {
    return html`
      <nav class="toolbar" role="toolbar" aria-label=${this.label}>
        <div class="toolbar__section toolbar__section--start">
          <slot name="start"></slot>
        </div>
        <div class="toolbar__section toolbar__section--content">
          <slot></slot>
        </div>
        <div
          class="toolbar__section toolbar__section--actions"
          data-toolbar-actions
          role="group"
          aria-label="Toolbar actions"
        >
          <slot name="actions"></slot>
        </div>
      </nav>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-toolbar': Pix3Toolbar;
  }
}
