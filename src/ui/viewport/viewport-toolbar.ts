import { html, type TemplateResult } from 'lit';

import type { NavigationMode } from '@/state';
import type { IconService } from '@/services/IconService';
import type { TransformMode } from '@/services/ViewportRenderService';

export interface ViewportToolbarState {
  readonly transformMode: TransformMode | null;
  readonly showGrid: boolean;
  readonly showLighting: boolean;
  readonly navigationMode: NavigationMode | null;
  readonly showLayer3D: boolean;
  readonly showLayer2D: boolean;
}

export interface ViewportToolbarHandlers {
  readonly onTransformModeChange?: (mode: TransformMode) => void;
  readonly onToggleGrid: () => void;
  readonly onToggleLighting?: () => void;
  readonly onToggleNavigationMode?: () => void;
  readonly onToggleLayer3D: () => void;
  readonly onToggleLayer2D: () => void;
  readonly onZoomDefault: () => void;
  readonly onZoomAll: () => void;
}

interface ToolbarButtonConfig {
  readonly ariaLabel: string;
  readonly title: string;
  readonly iconName?: string;
  readonly text?: string;
  readonly isPressed?: boolean;
  readonly isActive?: boolean;
  readonly onClick: () => void;
  readonly extraClass?: string;
}

const TRANSFORM_MODES: readonly {
  readonly mode: TransformMode;
  readonly iconName: string;
  readonly label: string;
}[] = [
  { mode: 'select', iconName: 'mouse-pointer', label: 'Select (Q)' },
  { mode: 'translate', iconName: 'move', label: 'Move (W)' },
  { mode: 'rotate', iconName: 'rotate-cw', label: 'Rotate (E)' },
  { mode: 'scale', iconName: 'maximize-2', label: 'Scale (R)' },
];

export function renderViewportToolbar(
  state: ViewportToolbarState,
  handlers: ViewportToolbarHandlers,
  iconService: IconService
): TemplateResult {
  return html`
    <div
      class="top-toolbar"
      @click=${(e: Event) => e.stopPropagation()}
      @pointerdown=${(e: Event) => e.stopPropagation()}
      @pointerup=${(e: Event) => e.stopPropagation()}
    >
      ${state.transformMode !== null && handlers.onTransformModeChange
        ? html`
            <div class="toolbar-group" role="toolbar" aria-label="Transform tools">
              ${TRANSFORM_MODES.map(({ mode, iconName, label }) =>
                renderToolbarButton(
                  {
                    ariaLabel: label,
                    title: label,
                    iconName,
                    isPressed: state.transformMode === mode,
                    isActive: state.transformMode === mode,
                    onClick: () => handlers.onTransformModeChange?.(mode),
                  },
                  iconService
                )
              )}
            </div>
          `
        : null}

      <div class="toolbar-group" role="toolbar" aria-label="Viewport visibility">
        ${renderToolbarButton(
          {
            ariaLabel: 'Toggle grid',
            title: 'Toggle Grid (G)',
            iconName: 'grid',
            isPressed: state.showGrid,
            onClick: handlers.onToggleGrid,
          },
          iconService
        )}
        ${handlers.onToggleLighting
          ? renderToolbarButton(
              {
                ariaLabel: 'Toggle lighting',
                title: 'Toggle Lighting (L)',
                iconName: 'sun',
                isPressed: state.showLighting,
                onClick: handlers.onToggleLighting,
              },
              iconService
            )
          : null}
        ${handlers.onToggleNavigationMode && state.navigationMode
          ? renderToolbarButton(
              {
                ariaLabel: 'Toggle navigation mode',
                title: 'Toggle Navigation Mode (N)',
                text: state.navigationMode === '3d' ? '3D' : '2D',
                isPressed: state.navigationMode === '2d',
                onClick: handlers.onToggleNavigationMode,
                extraClass: 'toolbar-button--mode',
              },
              iconService
            )
          : null}
        ${renderToolbarButton(
          {
            ariaLabel: 'Toggle 3D layer',
            title: 'Toggle 3D Layer (3)',
            text: '3D',
            isPressed: state.showLayer3D,
            onClick: handlers.onToggleLayer3D,
            extraClass: 'toolbar-button--layer',
          },
          iconService
        )}
        ${renderToolbarButton(
          {
            ariaLabel: 'Toggle 2D layer',
            title: 'Toggle 2D Layer (2)',
            text: '2D',
            isPressed: state.showLayer2D,
            onClick: handlers.onToggleLayer2D,
            extraClass: 'toolbar-button--layer',
          },
          iconService
        )}
      </div>

      <div class="toolbar-group" role="toolbar" aria-label="Viewport framing">
        ${renderToolbarButton(
          {
            ariaLabel: 'Reset zoom',
            title: 'Reset Zoom (Home)',
            iconName: 'zoom-default',
            onClick: handlers.onZoomDefault,
          },
          iconService
        )}
        ${renderToolbarButton(
          {
            ariaLabel: 'Show all',
            title: 'Show All (F)',
            iconName: 'zoom-all',
            onClick: handlers.onZoomAll,
          },
          iconService
        )}
      </div>

      <div class="toolbar-spacer"></div>
    </div>
  `;
}

function renderToolbarButton(
  config: ToolbarButtonConfig,
  iconService: IconService
): TemplateResult {
  return html`
    <button
      class="toolbar-button ${config.isActive
        ? 'toolbar-button--active'
        : ''} ${config.extraClass ?? ''}"
      aria-label=${config.ariaLabel}
      aria-pressed=${String(Boolean(config.isPressed))}
      title=${config.title}
      @click=${(e: Event) => {
        e.stopPropagation();
        e.stopImmediatePropagation();
        config.onClick();
      }}
    >
      ${config.iconName
        ? html`<span class="toolbar-icon">${iconService.getIcon(config.iconName)}</span>`
        : null}
      ${config.text ? html`<span class="toolbar-label">${config.text}</span>` : null}
    </button>
  `;
}
