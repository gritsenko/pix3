import { ComponentBase, customElement, html, property } from '@/fw';
import './pix3-toolbar-button.ts.css';

@customElement('pix3-toolbar-button')
export class Pix3ToolbarButton extends ComponentBase {
  @property({ type: Boolean, reflect: true })
  disabled = false;

  @property({ type: Boolean, reflect: true })
  toggled = false;

  @property({ attribute: 'aria-label' })
  label: string | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute('role', 'button');
    this.setAttribute('aria-pressed', String(this.toggled));
    if (!this.hasAttribute('tabindex')) {
      this.tabIndex = -1;
    }
    this.updateAriaDisabled();
    this.setupEventListeners();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListeners();
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('toggled')) {
      this.setAttribute('aria-pressed', String(this.toggled));
    }

    if (changed.has('disabled')) {
      this.updateAriaDisabled();
    }

    if (changed.has('label')) {
      if (this.label) {
        this.setAttribute('aria-label', this.label);
      } else {
        this.removeAttribute('aria-label');
      }
    }
  }

  private keydownHandler = (event: KeyboardEvent) => {
    if (this.disabled) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      this.click();
    }
  };

  private pointerDownHandler = (event: PointerEvent) => {
    if (this.disabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    this.focus();
  };

  private clickHandler = (event: MouseEvent) => {
    if (this.disabled) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  private setupEventListeners(): void {
    this.addEventListener('keydown', this.keydownHandler);
    this.addEventListener('pointerdown', this.pointerDownHandler);
    this.addEventListener('click', this.clickHandler, { capture: true });
  }

  private removeEventListeners(): void {
    this.removeEventListener('keydown', this.keydownHandler);
    this.removeEventListener('pointerdown', this.pointerDownHandler);
    this.removeEventListener('click', this.clickHandler, { capture: true });
  }

  private updateAriaDisabled(): void {
    if (this.disabled) {
      this.setAttribute('aria-disabled', 'true');
      this.tabIndex = -1;
    } else {
      this.removeAttribute('aria-disabled');
      if (!this.hasAttribute('tabindex')) {
        this.tabIndex = -1;
      }
    }
  }

  protected render() {
    return html`<span class="toolbar-button"><slot></slot></span>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-toolbar-button': Pix3ToolbarButton;
  }
}
