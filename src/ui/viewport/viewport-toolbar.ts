import { html, type TemplateResult } from 'lit';
import type { DropdownItem } from '@/ui/shared/pix3-dropdown-button';

import type { EditorCameraProjection, NavigationMode } from '@/state';
import type { IconService } from '@/services/IconService';
import type { TransformMode } from '@/services/ViewportRenderService';

export interface ViewportToolbarState {
  readonly transformMode: TransformMode | null;
  readonly showGrid: boolean;
  readonly showLighting: boolean;
  readonly navigationMode: NavigationMode | null;
  readonly showLayer3D: boolean;
  readonly showLayer2D: boolean;
  readonly previewCameraLabel: string;
  readonly previewCameraItems: DropdownItem[];
  readonly isPreviewCameraActive: boolean;
  readonly editorCameraProjection: EditorCameraProjection;
}

export interface ViewportToolbarHandlers {
  readonly onTransformModeChange?: (mode: TransformMode) => void;
  readonly onToggleNavigationMode?: () => void;
  readonly onZoomDefault: () => void;
  readonly onZoomAll: () => void;
  readonly onSelectPreviewCamera: (itemId: string) => void;
  readonly onToggleGrid: () => void;
  readonly onToggleLighting: () => void;
  readonly onToggleLayer3D: () => void;
  readonly onToggleLayer2D: () => void;
  readonly onSetEditorCameraProjection: (projection: EditorCameraProjection) => void;
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

      <div class="toolbar-group" role="toolbar" aria-label="Viewport controls">
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
      </div>

      <div class="toolbar-group" role="toolbar" aria-label="Viewport framing">
        <pix3-dropdown-button
          class="toolbar-dropdown-button ${state.isPreviewCameraActive
            ? 'toolbar-dropdown-button--active'
            : ''}"
          icon="camera"
          aria-label="Camera preview"
          title=${`Camera Preview: ${state.previewCameraLabel}`}
          .items=${state.previewCameraItems}
          @item-select=${(e: CustomEvent<DropdownItem>) => {
            e.stopPropagation();
            handlers.onSelectPreviewCamera(e.detail.id);
          }}
        ></pix3-dropdown-button>
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

      <div class="toolbar-group" role="toolbar" aria-label="Viewport visibility settings">
        <pix3-viewport-visibility-popover
          .showGrid=${state.showGrid}
          .showLighting=${state.showLighting}
          .showLayer2D=${state.showLayer2D}
          .showLayer3D=${state.showLayer3D}
          .editorCameraProjection=${state.editorCameraProjection}
          @toggle-grid=${() => handlers.onToggleGrid()}
          @toggle-lighting=${() => handlers.onToggleLighting()}
          @toggle-layer-2d=${() => handlers.onToggleLayer2D()}
          @toggle-layer-3d=${() => handlers.onToggleLayer3D()}
          @projection-change=${(e: CustomEvent<{ projection: EditorCameraProjection }>) =>
            handlers.onSetEditorCameraProjection(e.detail.projection)}
        ></pix3-viewport-visibility-popover>
      </div>
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
