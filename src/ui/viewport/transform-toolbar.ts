import { html, type TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import feather from 'feather-icons';

import type { TransformMode } from '@/services/ViewportRenderService';

export type ModeChangeHandler = (mode: TransformMode) => void;

// Small, self-contained renderer for the transform toolbar so the markup is
// reusable and separate from the viewport panel logic.
export function renderTransformToolbar(current: TransformMode, onChange: ModeChangeHandler): TemplateResult {
  const transformModes: Array<{ mode: TransformMode; iconName: string; label: string; key: string }> = [
    // use a mouse pointer icon for select mode
    { mode: 'select', iconName: 'mouse-pointer', label: 'Select (Q)', key: 'Q' },
    { mode: 'translate', iconName: 'move', label: 'Move (W)', key: 'W' },
    { mode: 'rotate', iconName: 'rotate-cw', label: 'Rotate (E)', key: 'E' },
    { mode: 'scale', iconName: 'maximize', label: 'Scale (R)', key: 'R' },
  ];

  const renderIcon = (name: string, fallback: string) => {
    try {
      const icon = (feather as any).icons?.[name];
      if (icon && typeof icon.toSvg === 'function') {
        return unsafeHTML(icon.toSvg({ width: 16, height: 16 }));
      }
    } catch {
      // ignore and fall through to fallback
    }
    return html`${fallback}`;
  };

  return html`
    <div class="transform-toolbar" stop-propagation>
      ${transformModes.map(
        ({ mode, iconName, label }) => html`
          <button
            class="toolbar-button ${current === mode ? 'toolbar-button--active' : ''}"
            @pointerup=${(e: PointerEvent) => e.stopPropagation()}
            @click=${(e: PointerEvent) => {
              e.stopPropagation();
              onChange(mode);
            }}
            title=${label}
            aria-label=${label}
          >
            <span class="toolbar-icon">${renderIcon(iconName, mode)}</span>
          </button>
        `
      )}
    </div>
  `;
}

export default renderTransformToolbar;
