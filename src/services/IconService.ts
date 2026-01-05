import { injectable } from '@/fw';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import type { TemplateResult } from 'lit';
import { html } from 'lit';
import feather from 'feather-icons';

// Feather icon typing helper
type FeatherIcon = { toSvg?: (opts?: Record<string, unknown>) => string };
type FeatherIconMap = Record<string, FeatherIcon>;

/**
 * Standard icon sizes used throughout the application
 */
export const IconSize = {
  SMALL: 14,
  MEDIUM: 16,
  LARGE: 18,
  XLARGE: 24,
} as const;

export type IconSizeValue = (typeof IconSize)[keyof typeof IconSize];

/**
 * Centralized icon service for rendering SVG icons throughout the application.
 * Supports Feather Icons library and custom SVG registrations with caching for performance.
 */
@injectable()
export class IconService {
  private readonly customIcons = new Map<string, string>();
  private readonly iconCache = new Map<string, string>();

  constructor() {
    this.registerCustomIcons();
  }

  /**
   * Register all custom SVG icons not available in Feather Icons
   */
  private registerCustomIcons(): void {
    // Custom grid icon (viewport)
    this.customIcons.set(
      'grid',
      `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M6 3V21M12 3V21M18 3V21M3 6H21M3 12H21M3 18H21" 
        stroke="currentColor" 
        stroke-width="2" 
        stroke-linecap="round" 
        stroke-linejoin="round"/>
</svg>`
    );

    // Close/cross icon (welcome screen)
    this.customIcons.set(
      'x-close',
      `<svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M11 1L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M1 1L11 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`
    );

    // Plus circle outline (welcome screen)
    this.customIcons.set(
      'plus-circle-outline',
      `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="1.5" />
  <path d="M10 6V14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  <path d="M6 10H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
</svg>`
    );

    // Folder icon (welcome screen, asset browser)
    this.customIcons.set(
      'folder-outline',
      `<svg viewBox="0 0 18 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 3.5C1 2.67157 1.67157 2 2.5 2H6.5L8 4H15.5C16.3284 4 17 4.67157 17 5.5V11.5C17 12.3284 16.3284 13 15.5 13H2.5C1.67157 13 1 12.3284 1 11.5V3.5Z"
      stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`
    );

    // Folder icon with fill for asset tree
    this.customIcons.set(
      'folder-solid',
      `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 7C3 5.89543 3.89543 5 5 5H9L11 8H19C20.1046 8 21 8.89543 21 10V17C21 18.1046 20.1046 19 19 19H5C3.89543 19 3 18.1046 3 17V7Z" 
      stroke="currentColor" 
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill="none"/>
  </svg>`
    );

    // File icon for asset tree
    this.customIcons.set(
      'file-solid',
      `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" 
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="none"/>
      <path d="M14 2V8H20" 
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="none"/>
    </svg>`
    );

    // Chevron right (caret for asset tree)
    this.customIcons.set(
      'chevron-right-caret',
      `<svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 2L8 6L4 10" 
        stroke="currentColor" 
        stroke-width="1.6" 
        stroke-linecap="round" 
        stroke-linejoin="round" 
        fill="none" 
        style="opacity:0.5"/>
</svg>`
    );

    // Chevron down (caret for dropdown)
    this.customIcons.set(
      'chevron-down-caret',
      `<svg viewBox="0 0 12 12">
  <path d="M3 4L6 7L9 4" 
        stroke="currentColor" 
        stroke-width="1.2" 
        stroke-linecap="round" 
        stroke-linejoin="round" 
        fill="none"/>
</svg>`
    );

    // Zoom to default icon (reset zoom to 100%)
    this.customIcons.set(
      'zoom-default',
      `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M21 21L16.65 16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M8 11H14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M11 8V14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`
    );

    // Zoom all icon (fit all content in view)
    this.customIcons.set(
      'zoom-all',
      `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="3" width="7" height="7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="14" y="3" width="7" height="7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="3" y="14" width="7" height="7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="14" y="14" width="7" height="7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M10 12H14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12 10V14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`
    );
  }

  /**
   * Get an icon as a Lit TemplateResult ready for rendering
   * @param name - Icon name (Feather icon name or custom icon key)
   * @param size - Icon size in pixels (default: MEDIUM/16px)
   * @returns TemplateResult with SVG content
   */
  getIcon(name: string, size: number = IconSize.MEDIUM): TemplateResult {
    const cacheKey = `${name}-${size}`;

    let svg = '';

    // Check cache first (cache stores raw SVG strings)
    if (this.iconCache.has(cacheKey)) {
      svg = this.iconCache.get(cacheKey)!;
      return html`${unsafeHTML(svg)}`;
    }

    // Check custom icons first
    if (this.customIcons.has(name)) {
      svg = this.customIcons.get(name)!;
      // Apply size to custom icons
      svg = this.applySizeToSvg(svg, size);
    } else {
      // Try Feather Icons
      try {
        const featherIcons = feather.icons as FeatherIconMap;
        const icon = featherIcons[name];
        if (icon && typeof icon.toSvg === 'function') {
          svg = icon.toSvg({
            width: size,
            height: size,
            stroke: 'currentColor',
            fill: 'none',
            'stroke-width': 2,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          } as Record<string, unknown>);
        } else {
          console.warn(`[IconService] Icon not found: ${name}`);
          // Return fallback icon (box)
          const fallbackIcon = featherIcons['box'];
          if (fallbackIcon && typeof fallbackIcon.toSvg === 'function') {
            svg = fallbackIcon.toSvg({
              width: size,
              height: size,
              stroke: 'currentColor',
              fill: 'none',
              'stroke-width': 2,
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
            } as Record<string, unknown>);
          }
        }
      } catch (error) {
        console.warn(`[IconService] Failed to load icon: ${name}`, error);
      }
    }

    // Cache the raw SVG string for future use
    if (svg) {
      this.iconCache.set(cacheKey, svg);
    }

    return html`${unsafeHTML(svg)}`;
  }

  /**
   * Get an icon that accepts raw SVG strings or icon names
   * (Used by components like pix3-dropdown-button that support both)
   * @param iconName - Icon name or raw SVG string
   * @param size - Icon size in pixels
   * @returns TemplateResult with SVG content
   */
  getIconOrRawSvg(iconName: string, size: number = IconSize.MEDIUM): TemplateResult {
    // If it's already an SVG string, return it wrapped
    if (iconName.includes('<svg') || iconName.includes('<?xml')) {
      return html`${unsafeHTML(iconName)}`;
    }
    // Otherwise, resolve as icon name
    return this.getIcon(iconName, size);
  }

  /**
   * Register a custom icon at runtime
   * @param name - Unique icon name
   * @param svgContent - SVG content string
   */
  registerIcon(name: string, svgContent: string): void {
    this.customIcons.set(name, svgContent);
    // Clear cached entries for this icon
    Array.from(this.iconCache.keys())
      .filter(key => key.startsWith(`${name}-`))
      .forEach(key => this.iconCache.delete(key));
  }

  /**
   * Apply width and height attributes to an SVG string
   */
  private applySizeToSvg(svg: string, size: number): string {
    // Only modify the opening <svg ...> tag to add/replace width/height
    const updated = svg.replace(/<svg([^>]*)>/, (_match, attrs) => {
      // Remove any existing width/height attributes inside the opening tag (avoid touching stroke-width)
      let newAttrs = attrs.replace(/\s(?:width|height)="[^"]*"/g, '');

      // Ensure there's a display style on the svg tag (but don't clobber existing style)
      if (!/\bstyle\s*=/.test(newAttrs)) {
        newAttrs = `${newAttrs} style="display:block"`;
      }

      // Append explicit width and height
      newAttrs = `${newAttrs} width="${size}" height="${size}"`;

      return `<svg${newAttrs}>`;
    });

    return updated;
  }

  /**
   * Clear the icon cache (useful for testing or memory management)
   */
  clearCache(): void {
    this.iconCache.clear();
  }

  dispose(): void {
    this.iconCache.clear();
    this.customIcons.clear();
  }
}
