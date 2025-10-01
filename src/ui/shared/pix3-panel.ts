import { ComponentBase, css, customElement, html, inject, property } from '@/fw';
import { ifDefined } from 'lit/directives/if-defined.js';
import { FocusRingService } from '@/services/FocusRingService';

let panelCounter = 0;

@customElement('pix3-panel')
export class Pix3Panel extends ComponentBase {
  @property({ attribute: 'panel-title' })
  title = '';

  @property({ attribute: 'panel-description' })
  description = '';

  @property({ attribute: 'panel-role' })
  panelRole: 'region' | 'form' | 'presentation' = 'region';

  @property({ attribute: 'actions-label' })
  actionsLabel = 'Panel actions';

  @property({ attribute: 'accent', reflect: true })
  accent: 'default' | 'primary' | 'warning' = 'default';

  @inject(FocusRingService)
  private readonly focusRing!: FocusRingService;

  private cleanupActions?: () => void;
  private readonly instanceId = panelCounter++;

  disconnectedCallback(): void {
    this.cleanupActions?.();
    this.cleanupActions = undefined;
    super.disconnectedCallback();
  }

  protected firstUpdated(): void {
    this.ensureActionsFocusController();
  }

  protected updated(): void {
    this.ensureActionsFocusController();
  }

  private ensureActionsFocusController(): void {
    if (this.cleanupActions) {
      return;
    }

    const root = (this.renderRoot as HTMLElement) ?? this;
    const actionsHost = root.querySelector<HTMLElement>('[data-panel-actions]');
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
    const headerId = `pix3-panel-${this.instanceId}-header`;
    const descriptionId = this.description
      ? `pix3-panel-${this.instanceId}-description`
      : undefined;

    const ariaDescribedBy = descriptionId ? descriptionId : undefined;

    return html`
      <section
        class="panel"
        role=${this.panelRole}
        aria-labelledby=${headerId}
        aria-describedby=${ifDefined(ariaDescribedBy)}
      >
        <header id=${headerId} class="panel__header" tabindex="0">
          <div class="panel__heading">
            <span class="panel__title">${this.title}</span>
            <slot name="subtitle" class="panel__subtitle"></slot>
          </div>
          <div
            class="panel__actions"
            data-panel-actions
            role="toolbar"
            aria-label=${this.actionsLabel}
          >
            <slot name="actions"></slot>
          </div>
        </header>
        ${this.description
          ? html`<p id=${ifDefined(descriptionId)} class="panel__description">
              ${this.description}
            </p>`
          : null}
        <div class="panel__body">
          <slot></slot>
        </div>
        <footer class="panel__footer">
          <slot name="footer"></slot>
        </footer>
      </section>
    `;
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }

    .panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(
        --pix3-panel-background,
        linear-gradient(180deg, rgba(30, 34, 40, 0.96), rgba(20, 22, 28, 0.94))
      );
      color: var(--pix3-panel-foreground, rgba(245, 247, 250, 0.92));
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 0.4rem;
      box-shadow: 0 18px 28px rgba(0, 0, 0, 0.22);
      overflow: hidden;
    }

    :host([accent='primary']) .panel {
      border-color: rgba(48, 164, 255, 0.45);
      box-shadow:
        0 0 0 1px rgba(48, 164, 255, 0.25),
        0 22px 38px rgba(0, 0, 0, 0.24);
    }

    :host([accent='warning']) .panel {
      border-color: rgba(255, 176, 64, 0.45);
    }

    .panel__header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: var(--pix3-panel-header-background, rgba(38, 42, 50, 0.92));
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      outline: none;
    }

    .panel__header:focus-visible {
      box-shadow: 0 0 0 2px rgba(94, 194, 255, 0.8);
    }

    .panel__heading {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .panel__title {
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    ::slotted([slot='subtitle']) {
      font-size: 0.72rem;
      color: rgba(245, 247, 250, 0.6);
    }

    .panel__actions {
      display: inline-flex;
      align-items: center;
      margin-inline-start: auto;
      gap: 0.4rem;
    }

    .panel__body {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 1rem;
      font-size: 0.9rem;
      backdrop-filter: blur(8px);
    }

    .panel__description {
      margin: 0;
      padding: 0.5rem 1rem;
      font-size: 0.78rem;
      color: rgba(245, 247, 250, 0.62);
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      background: rgba(32, 36, 44, 0.6);
    }

    .panel__footer {
      padding: 0.5rem 1rem;
      border-top: 1px solid rgba(255, 255, 255, 0.04);
      font-size: 0.78rem;
      color: rgba(245, 247, 250, 0.6);
    }

    .panel__footer:empty {
      display: none;
    }

    ::slotted(.panel-placeholder) {
      margin: 0;
      color: rgba(245, 247, 250, 0.58);
      font-style: italic;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-panel': Pix3Panel;
  }
}
