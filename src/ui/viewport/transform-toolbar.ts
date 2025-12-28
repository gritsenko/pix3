import { html, type TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import feather from 'feather-icons';

import type { TransformMode } from '@/services/ViewportRenderService';

export type ModeChangeHandler = (mode: TransformMode) => void;

export function renderTransformToolbar(
  current: TransformMode,
  onChange: ModeChangeHandler
): TemplateResult {
  const transformModes = [
    { mode: 'select' as const, iconName: 'mouse-pointer', label: 'Select (Q)' },
    { mode: 'translate' as const, iconName: 'move', label: 'Move (W)' },
    { mode: 'rotate' as const, iconName: 'rotate-cw', label: 'Rotate (E)' },
    { mode: 'scale' as const, iconName: 'maximize-2', label: 'Scale (R)' },
  ];

  return html`
    ${transformModes.map(
      ({ mode, iconName, label }) => html`
        <button
          class="toolbar-button ${current === mode ? 'toolbar-button--active' : ''}"
          @click="${(e: Event) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
            onChange(mode);
          }}"
          title="${label}"
          aria-label="${label}"
          aria-pressed="${current === mode}"
        >
          <span class="toolbar-icon">${renderIcon(iconName)}</span>
        </button>
      `
    )}
  `;
}

function renderIcon(name: string): TemplateResult {
  try {
    const icon = (feather as any).icons?.[name];
    if (icon && typeof icon.toSvg === 'function') {
      return html`${unsafeHTML(icon.toSvg({ width: 16, height: 16 })) as any}`;
    }
  } catch {}
  return html``;
}

export default renderTransformToolbar;
