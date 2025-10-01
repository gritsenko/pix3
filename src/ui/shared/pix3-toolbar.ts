import { ComponentBase, css, customElement, html, inject, property } from '@/fw';
import { FocusRingService } from '@/services/FocusRingService';

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

  static styles = css`
    :host {
      display: flex;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      inline-size: 100%;
      padding: 0.75rem 1rem;
      background: var(--pix3-toolbar-background, rgba(26, 29, 35, 0.92));
      color: var(--pix3-toolbar-foreground, rgba(245, 247, 250, 0.92));
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    :host([dense]) .toolbar {
      padding-block: 0.5rem;
    }

    .toolbar__section {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .toolbar__section--start {
      min-width: 0;
    }

    .toolbar__section--content {
      flex: 1;
      min-width: 0;
      justify-content: flex-end;
    }

    .toolbar__section--actions {
      gap: 0.25rem;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-toolbar': Pix3Toolbar;
  }
}
