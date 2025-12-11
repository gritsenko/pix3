import { ComponentBase, customElement, html, inject, state, unsafeCSS } from '@/fw';
import { CommandRegistry, type MenuSection } from '@/services/CommandRegistry';
import { CommandDispatcher } from '@/services/CommandDispatcher';
import styles from './pix3-main-menu.ts.css?raw';

@customElement('pix3-main-menu')
export class Pix3MainMenu extends ComponentBase {
  @inject(CommandRegistry)
  private readonly commandRegistry!: CommandRegistry;

  @inject(CommandDispatcher)
  private readonly commandDispatcher!: CommandDispatcher;

  // Use light DOM (default) to avoid clipping issues with absolutely positioned dropdowns
  @state()
  private activeSection: string | null = null;

  @state()
  private menuOpenedByClick = false;

  @state()
  private menuSections: MenuSection[] = [];

  private portalElement: HTMLElement | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    // Load menu sections from registry
    this.menuSections = this.commandRegistry.buildMenuSections();
    document.addEventListener('click', this.handleDocumentClick);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('click', this.handleDocumentClick);
    this.removePortal();
  }

  protected firstUpdated(): void {
    this.ensureMenuFocusGroup();
  }

  protected updated(): void {
    this.ensureMenuFocusGroup();
    if (this.activeSection) {
      this.createPortal();
      this.updateMenuPosition();
    } else {
      this.removePortal();
    }
  }

  private createPortal(): void {
    if (this.portalElement) {
      return;
    }

    this.portalElement = document.createElement('div');
    this.portalElement.className = 'pix3-menu-portal';
    document.body.appendChild(this.portalElement);
  }

  private removePortal(): void {
    if (this.portalElement) {
      this.portalElement.remove();
      this.portalElement = null;
    }
  }

  private ensureMenuFocusGroup(): void {
    if (!this.activeSection) {
      return;
    }

    const menuItems = this.querySelectorAll<HTMLElement>('.menu-item:not([disabled])');
    if (menuItems.length === 0) {
      return;
    }

    // Set focus to first menu item when menu opens
    setTimeout(() => {
      menuItems[0]?.focus();
    }, 0);
  }

  private updateMenuPosition = () => {
    setTimeout(() => {
      if (!this.activeSection) return;

      const trigger = this.querySelector(
        `.menu-section-button[data-section="${this.activeSection}"]`
      ) as HTMLElement;

      if (!trigger || !this.portalElement) return;

      const triggerRect = trigger.getBoundingClientRect();

      // Render menu to portal
      const menuHTML = this.renderMenuToString();
      this.portalElement.innerHTML = menuHTML;

      // Style the portal
      const dropdown = this.portalElement.querySelector('.menu-dropdown') as HTMLElement;
      if (dropdown) {
        dropdown.style.position = 'fixed';
        dropdown.style.top = `${triggerRect.bottom + 4}px`;
        dropdown.style.left = `${triggerRect.left}px`;

        // Re-attach event listeners to the portal menu items
        this.attachPortalEventListeners();
      }
    }, 0);
  };

  private renderMenuToString(): string {
    if (!this.activeSection) return '';

    const section = this.menuSections.find(s => s.id === this.activeSection);
    if (!section) return '';

    return `
      <div class="menu-dropdown" role="menu" onmouseleave="this.dispatchEvent(new CustomEvent('menu-mouseleave', {bubbles: true}))">
        <div class="menu-section" role="group" aria-label="${section.label}">
          <div class="section-items">
            ${section.items
              .map(
                item =>
                  `<button
                      role="menuitem"
                      class="menu-item"
                      data-menu-item="${item.id}"
                      data-command-id="${item.commandId}"
                    >
                      <span class="menu-item-label">${item.label}</span>
                      ${item.shortcut ? `<span class="menu-item-shortcut">${item.shortcut}</span>` : ''}
                    </button>`
              )
              .join('')}
          </div>
        </div>
      </div>
    `;
  }

  private attachPortalEventListeners(): void {
    if (!this.portalElement) return;

    const menuItems = this.portalElement.querySelectorAll<HTMLElement>('.menu-item');
    menuItems.forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const menuItemId = item.getAttribute('data-menu-item');
        const commandId = item.getAttribute('data-command-id');
        if (menuItemId && commandId) {
          void this.executeMenuItem(commandId);
        }
      });
    });

    // Add mouse leave handler for the dropdown
    const dropdown = this.portalElement.querySelector('.menu-dropdown');
    if (dropdown) {
      dropdown.addEventListener('menu-mouseleave', () => {
        if (!this.menuOpenedByClick && this.activeSection !== null) {
          this.activeSection = null;
        }
      });
    }
  }

  private async executeMenuItem(commandId: string): Promise<void> {
    const command = this.commandRegistry.getCommand(commandId);
    if (command) {
      await this.commandDispatcher.execute(command);
    }
    this.activeSection = null;
    this.menuOpenedByClick = false;
  }

  private handleDocumentClick = (event: MouseEvent) => {
    const target = event.target as Node;
    if (!this.contains(target) && this.activeSection) {
      this.activeSection = null;
      this.menuOpenedByClick = false;
    }
  };

  private toggleSection = (sectionId: string) => {
    this.activeSection = this.activeSection === sectionId ? null : sectionId;
    this.menuOpenedByClick = this.activeSection !== null;
  };

  private handleSectionHover = (sectionId: string) => {
    // Only allow hover to open menus if a menu is already open (either by click or hover)
    if (this.activeSection !== null) {
      this.activeSection = sectionId;
    }
  };

  private handleSectionMouseLeave = () => {
    // Don't close on mouse leave if opened by click - let document click handle it
    if (!this.menuOpenedByClick && this.activeSection !== null) {
      this.activeSection = null;
    }
  };

  private handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.activeSection = null;
    }
  };

  protected render() {
    return html`
      <style>
        ${unsafeCSS(styles)}
      </style>
      <div class="main-menu" @keydown=${this.handleKeydown}>
        <div class="menu-bar">
          <img src="/menu-logo.png" alt="Pix3" class="menu-logo" />
          ${this.menuSections.map(
            section => html`
              <button
                class="menu-section-button ${this.activeSection === section.id
                  ? 'menu-section-button--active'
                  : ''}"
                data-section=${section.id}
                @click=${() => this.toggleSection(section.id)}
                @mouseenter=${() => this.handleSectionHover(section.id)}
                @mouseleave=${this.handleSectionMouseLeave}
                aria-haspopup="menu"
                aria-expanded=${this.activeSection === section.id}
              >
                ${section.label}
              </button>
            `
          )}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-main-menu': Pix3MainMenu;
  }
}
