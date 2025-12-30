import { html, type TemplateResult } from 'lit';

import type { TransformMode } from '@/services/ViewportRenderService';
import type { IconService } from '@/services/IconService';

export type ModeChangeHandler = (mode: TransformMode) => void;

export function renderTransformToolbar(
  current: TransformMode,
  onChange: ModeChangeHandler,
  iconService: IconService
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
          <span class="toolbar-icon">${iconService.getIcon(iconName)}</span>
        </button>
      `
    )}
  `;
}

export default renderTransformToolbar;
