import { ComponentBase, customElement, html, state, unsafeCSS } from '@/fw';
import styles from './pix3-main-menu.ts.css?raw';

export interface MenuSection {
  id: string;
  label: string;
  items: MenuItem[];
}

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  disabled?: boolean;
  divider?: boolean;
  shortcut?: string;
}

@customElement('pix3-main-menu')
export class Pix3MainMenu extends ComponentBase {
  // Use light DOM (default) to avoid clipping issues with absolutely positioned dropdowns
  @state()
  private isOpen = false;

  private menuSections: MenuSection[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'new', label: 'New Project', shortcut: '⌘N' },
        { id: 'open', label: 'Open Project', shortcut: '⌘O' },
        { id: 'recent', label: 'Recent Projects' },
        { divider: true, id: 'file-divider-1', label: '' },
        { id: 'save', label: 'Save', shortcut: '⌘S' },
        { id: 'save-as', label: 'Save As...', shortcut: '⌘⇧S' },
        { divider: true, id: 'file-divider-2', label: '' },
        { id: 'close', label: 'Close Project' },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { id: 'undo', label: 'Undo', shortcut: '⌘Z' },
        { id: 'redo', label: 'Redo', shortcut: '⌘⇧Z' },
        { divider: true, id: 'edit-divider-1', label: '' },
        { id: 'cut', label: 'Cut', shortcut: '⌘X' },
        { id: 'copy', label: 'Copy', shortcut: '⌘C' },
        { id: 'paste', label: 'Paste', shortcut: '⌘V' },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'zoom-in', label: 'Zoom In', shortcut: '⌘+' },
        { id: 'zoom-out', label: 'Zoom Out', shortcut: '⌘-' },
        { id: 'zoom-reset', label: 'Reset Zoom', shortcut: '⌘0' },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { id: 'docs', label: 'Documentation' },
        { id: 'about', label: 'About Pix3' },
      ],
    },
  ];

  private portalElement: HTMLElement | null = null;

  connectedCallback(): void {
    super.connectedCallback();
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
    if (this.isOpen) {
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
    if (!this.isOpen) {
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
      const trigger = this.querySelector('.menu-trigger') as HTMLElement;
      
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
    return `
      <div class="menu-dropdown" role="menu">
        ${this.menuSections
          .map(
            section => `
          <div class="menu-section" role="group" aria-label="${section.label}">
            <div class="section-label">${section.label}</div>
            <div class="section-items">
              ${section.items
                .map(
                  item =>
                    item.divider
                      ? `<div class="menu-divider" role="separator"></div>`
                      : `<button
                          role="menuitem"
                          class="menu-item ${item.disabled ? 'menu-item--disabled' : ''}"
                          ${item.disabled ? 'disabled' : ''}
                          data-menu-item="${item.id}"
                        >
                          <span class="menu-item-label">${item.label}</span>
                          ${item.shortcut ? `<span class="menu-item-shortcut">${item.shortcut}</span>` : ''}
                        </button>`
                )
                .join('')}
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  private attachPortalEventListeners(): void {
    if (!this.portalElement) return;

    const menuItems = this.portalElement.querySelectorAll<HTMLElement>('.menu-item:not([disabled])');
    menuItems.forEach(item => {
      item.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const itemId = item.getAttribute('data-menu-item');
        if (itemId) {
          this.selectMenuItem(itemId);
        }
      });
    });
  };

  private handleDocumentClick = (event: MouseEvent) => {
    const target = event.target as Node;
    if (!this.contains(target) && this.isOpen) {
      this.isOpen = false;
    }
  };

  private toggleMenu = () => {
    this.isOpen = !this.isOpen;
  };

  private selectMenuItem = (itemId: string) => {
    this.dispatchEvent(
      new CustomEvent('menu-item-select', {
        detail: { itemId },
        bubbles: true,
        composed: true,
      })
    );
    this.isOpen = false;
  }

  private handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.isOpen = false;
    }
  };

  protected render() {
    return html`
      <style>
        ${unsafeCSS(styles)}
      </style>
      <div class="main-menu" @keydown=${this.handleKeydown}>
        <button
          class="menu-trigger"
          @click=${this.toggleMenu}
          aria-label="Menu"
          aria-haspopup="menu"
          aria-expanded=${this.isOpen}
        >
          <img src="/splash-logo.png" alt="Pix3" class="menu-logo" />
        </button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-main-menu': Pix3MainMenu;
  }
}
