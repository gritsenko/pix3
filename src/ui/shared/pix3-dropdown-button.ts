import { ComponentBase, customElement, html, property, state } from '@/fw';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import feather from 'feather-icons';
import './pix3-dropdown-button.ts.css';

export interface DropdownItem {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  divider?: boolean;
}

@customElement('pix3-dropdown-button')
export class Pix3DropdownButton extends ComponentBase {
  @property({ type: String })
  icon = '';

  @property({ type: String, attribute: 'aria-label' })
  ariaLabel = 'Menu';

  @property({ type: Boolean, reflect: true })
  disabled = false;

  @property({ type: Array })
  items: DropdownItem[] = [];

  @state()
  private isOpen = false;

  connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute('role', 'menubutton');
    this.setAttribute('aria-haspopup', 'menu');
    this.setAttribute('aria-expanded', 'false');
    if (!this.hasAttribute('tabindex')) {
      this.tabIndex = -1;
    }
    this.setupEventListeners();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListeners();
  }

  protected updated(changed: Map<string, unknown>): void {
    if (changed.has('disabled')) {
      this.updateAriaDisabled();
    }

    if (changed.has('isOpen')) {
      this.setAttribute('aria-expanded', String(this.isOpen));
    }

    if (changed.has('ariaLabel')) {
      this.setAttribute('aria-label', this.ariaLabel);
    }
  }

  private keydownHandler = (event: KeyboardEvent) => {
    if (this.disabled) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      this.isOpen = !this.isOpen;
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.isOpen = false;
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
      return;
    }
    this.isOpen = !this.isOpen;
  };

  private setupEventListeners(): void {
    this.addEventListener('keydown', this.keydownHandler);
    this.addEventListener('pointerdown', this.pointerDownHandler);
    this.addEventListener('click', this.clickHandler, { capture: true });
    document.addEventListener('click', this.handleOutsideClick);
  }

  private removeEventListeners(): void {
    this.removeEventListener('keydown', this.keydownHandler);
    this.removeEventListener('pointerdown', this.pointerDownHandler);
    this.removeEventListener('click', this.clickHandler, { capture: true });
    document.removeEventListener('click', this.handleOutsideClick);
  }

  private handleOutsideClick = (event: MouseEvent) => {
    const target = event.target as Node;
    if (!this.contains(target) && this.isOpen) {
      this.isOpen = false;
    }
  };

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

  private selectItem = (item: DropdownItem) => {
    if (item.disabled || item.divider) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent('item-select', {
        detail: item,
        bubbles: true,
        composed: true,
      })
    );
    this.isOpen = false;
  };

  protected render() {
    const iconSvg = this.getIconSvg(this.icon);
    return html`
      <div class="dropdown__trigger">
        <span class="dropdown__icon">${unsafeHTML(iconSvg)}</span>
        <svg viewBox="0 0 12 12" class="dropdown__caret" aria-hidden="true">
          <path
            d="M3 4L6 7L9 4"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </div>
      ${this.isOpen
        ? html`<div class="dropdown__menu" role="menu">
            ${this.items.map(
              item =>
                html`${item.divider
                  ? html`<div class="dropdown__divider" role="separator"></div>`
                  : html`<button
                      role="menuitem"
                      class="dropdown__item ${item.disabled ? 'dropdown__item--disabled' : ''}"
                      ?disabled=${item.disabled}
                      @click=${() => this.selectItem(item)}
                    >
                      ${item.icon ? html`<span class="dropdown__item-icon">${this.getItemIconSvg(item.icon)}</span>` : null}
                      <span class="dropdown__item-label">${item.label}</span>
                    </button>`}`
            )}
          </div>`
        : null}
    `;
  }

  private getIconSvg(iconName: string | null): string {
    if (!iconName) {
      return '';
    }

    // If it already looks like SVG, return as-is
    if (iconName.includes('<svg') || iconName.includes('<?xml')) {
      return iconName;
    }

    // Try to resolve as feather icon name
    try {
      const icon = (feather.icons as Record<string, any>)[iconName];
      if (icon && typeof icon.toSvg === 'function') {
        return icon.toSvg({ width: 18, height: 18 });
      }
    } catch (error) {
      console.warn(`[Pix3DropdownButton] Failed to load icon: ${iconName}`, error);
    }

    return '';
  }

  private getItemIconSvg(iconName: string): ReturnType<typeof html> {
    // If it already looks like SVG, render as unsafe HTML
    if (iconName.includes('<svg') || iconName.includes('<?xml')) {
      return html`${unsafeHTML(iconName)}`;
    }

    // Try to resolve as feather icon name
    try {
      const icon = (feather.icons as Record<string, any>)[iconName];
      if (icon && typeof icon.toSvg === 'function') {
        return html`${unsafeHTML(icon.toSvg({ width: 16, height: 16 }))}`;
      }
    } catch (error) {
      console.warn(`[Pix3DropdownButton] Failed to load item icon: ${iconName}`, error);
    }

    return html`${unsafeHTML(iconName)}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-dropdown-button': Pix3DropdownButton;
  }
}
