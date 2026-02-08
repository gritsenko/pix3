/**
 * Dropdown Portal Utility
 *
 * Provides a reusable solution for rendering dropdown menus outside of constrained
 * containers using the portal pattern with fixed positioning.
 *
 * This avoids clipping issues caused by parent containers with overflow: hidden/auto
 * by rendering the dropdown at the document.body level with position: fixed.
 *
 * The portal works by moving the menu element from its original parent to a fixed-position
 * container at document.body level. This preserves all event listeners and Lit event bindings.
 */

export interface DropdownPortalOptions {
  /** Minimum width for the dropdown menu */
  minWidth?: string;
  /** Account for scrollbars on the page */
  accountForScrollbar?: boolean;
  /** Keep menu within viewport bounds */
  keepInViewport?: boolean;
}

export class DropdownPortal {
  private portalElement: HTMLElement | null = null;
  private menuElement: HTMLElement | null = null;
  private originalParent: HTMLElement | null = null;
  private originalNextSibling: Node | null = null;
  private options: DropdownPortalOptions;

  constructor(options: DropdownPortalOptions = {}) {
    this.options = {
      minWidth: '12rem',
      accountForScrollbar: true,
      keepInViewport: true,
      ...options,
    };
  }

  /**
   * Creates and positions a dropdown portal for the given trigger element and menu element
   * @param trigger - The button or element that triggered the dropdown
   * @param menuElement - The HTML element containing the dropdown menu
   */
  open(trigger: HTMLElement, menuElement: HTMLElement): void {
    this.menuElement = menuElement;
    // Store original position to restore later
    this.originalParent = menuElement.parentElement;
    this.originalNextSibling = menuElement.nextSibling;
    this.create();
    this.position(trigger);
  }

  /**
   * Closes and removes the dropdown portal, restoring the menu to its original position
   */
  close(): void {
    // Restore menu to original position if possible
    if (this.menuElement && this.originalParent) {
      if (this.originalNextSibling) {
        this.originalParent.insertBefore(this.menuElement, this.originalNextSibling);
      } else {
        this.originalParent.appendChild(this.menuElement);
      }
    }
    this.remove();
  }

  /**
   * Returns whether the portal is currently open
   */
  isOpen(): boolean {
    return this.portalElement !== null && this.portalElement.parentElement === document.body;
  }

  /**
   * Updates the position of the portal based on the trigger element
   * @param trigger - The button or element that triggered the dropdown
   */
  reposition(trigger: HTMLElement): void {
    if (!this.portalElement) {
      return;
    }
    this.position(trigger);
  }

  private create(): void {
    if (this.portalElement) {
      return;
    }

    this.portalElement = document.createElement('div');
    this.portalElement.className = 'pix3-dropdown-portal';
    document.body.appendChild(this.portalElement);

    // Move the menu element into the portal (preserves event listeners)
    if (this.menuElement) {
      this.portalElement.appendChild(this.menuElement);
    }
  }

  private remove(): void {
    if (this.portalElement) {
      this.portalElement.remove();
      this.portalElement = null;
    }
  }

  private position(trigger: HTMLElement): void {
    if (!this.portalElement) {
      return;
    }

    // Get the trigger's viewport position
    const triggerRect = trigger.getBoundingClientRect();

    // Position the portal menu below the trigger
    let top = triggerRect.bottom + 8; // 0.5rem gap
    let left = triggerRect.left;

    // Get the portal's dimensions to check viewport bounds
    const portal = this.portalElement.querySelector('[role="menu"]') as HTMLElement | null;
    if (portal && this.options.keepInViewport) {
      const portalRect = portal.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      // If menu goes off bottom, position it above the trigger instead
      if (top + portalRect.height > viewportHeight) {
        top = Math.max(0, triggerRect.top - portalRect.height - 8);
      }

      // If menu goes off right, adjust left position
      if (left + portalRect.width > viewportWidth) {
        left = Math.max(0, viewportWidth - portalRect.width - 8);
      }

      // If menu goes off left, keep at viewport edge
      if (left < 0) {
        left = 8;
      }
    }

    // Apply positioning
    this.portalElement.style.position = 'fixed';
    this.portalElement.style.top = `${top}px`;
    this.portalElement.style.left = `${left}px`;
    this.portalElement.style.zIndex = '999999';

    // Apply minimum width
    if (this.options.minWidth) {
      const menuDiv = this.portalElement.querySelector('[role="menu"]') as HTMLElement | null;
      if (menuDiv) {
        menuDiv.style.minWidth = this.options.minWidth;
      }
    }
  }
}
