import { GoldenLayout, type LayoutConfig } from 'golden-layout';

import { injectable } from '@/fw/di';
import { appState, type AppState, type PanelVisibilityState } from '@/state';
// Layout initialization logic inlined below
// Removed unused imports after inlining layout logic

const PANEL_COMPONENT_TYPES = {
  sceneTree: 'scene-tree',
  viewport: 'viewport',
  inspector: 'inspector',
  assetBrowser: 'asset-browser',
} as const;

export type PanelComponentType = (typeof PANEL_COMPONENT_TYPES)[keyof typeof PANEL_COMPONENT_TYPES];

const PANEL_TAG_NAMES: Record<PanelComponentType, keyof HTMLElementTagNameMap> = {
  [PANEL_COMPONENT_TYPES.sceneTree]: 'pix3-scene-tree-panel',
  [PANEL_COMPONENT_TYPES.viewport]: 'pix3-viewport-panel',
  [PANEL_COMPONENT_TYPES.inspector]: 'pix3-inspector-panel',
  [PANEL_COMPONENT_TYPES.assetBrowser]: 'pix3-asset-browser-panel',
};

const PANEL_DISPLAY_TITLES: Record<PanelComponentType, string> = {
  [PANEL_COMPONENT_TYPES.sceneTree]: 'Scene Tree',
  [PANEL_COMPONENT_TYPES.viewport]: 'Viewport',
  [PANEL_COMPONENT_TYPES.inspector]: 'Inspector',
  [PANEL_COMPONENT_TYPES.assetBrowser]: 'Asset Browser',
};

const DEFAULT_PANEL_VISIBILITY: PanelVisibilityState = {
  sceneTree: true,
  viewport: true,
  inspector: true,
  assetBrowser: true,
};

const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  settings: {
    hasHeaders: true,
    reorderEnabled: true,
  },
  header: {
    show: 'top',
  },
  dimensions: {
    minItemHeight: 120,
    minItemWidth: 200,
  },
  root: {
    type: 'row',
    content: [
      {
        type: 'column',
        width: 25,
        content: [
          {
            type: 'component',
            componentType: PANEL_COMPONENT_TYPES.sceneTree,
            title: PANEL_DISPLAY_TITLES[PANEL_COMPONENT_TYPES.sceneTree],
            isClosable: false,
          },
          {
            type: 'component',
            componentType: PANEL_COMPONENT_TYPES.assetBrowser,
            title: PANEL_DISPLAY_TITLES[PANEL_COMPONENT_TYPES.assetBrowser],
            height: 50,
            isClosable: false,
          },
        ],
      },
      {
        type: 'stack',
        width: 50,
        content: [
          {
            type: 'component',
            componentType: PANEL_COMPONENT_TYPES.viewport,
            title: PANEL_DISPLAY_TITLES[PANEL_COMPONENT_TYPES.viewport],
            isClosable: false,
          },
        ],
      },
      {
        type: 'component',
        width: 25,
        componentType: PANEL_COMPONENT_TYPES.inspector,
        title: PANEL_DISPLAY_TITLES[PANEL_COMPONENT_TYPES.inspector],
        isClosable: false,
      },
    ],
  },
} satisfies LayoutConfig;

@injectable()
export class LayoutManagerService {
  private layout: GoldenLayout | null = null;
  private readonly state: AppState;
  private container: HTMLElement | null = null;

  constructor(state: AppState = appState) {
    this.state = state;
  }

  async initialize(container: HTMLElement): Promise<void> {
    if (this.layout && this.container === container) {
      return;
    }

    if (this.layout) {
      this.dispose();
    }

    this.container = container;
    this.layout = new GoldenLayout(container);
    this.layout.resizeWithContainerAutomatically = true;

    this.registerComponents(this.layout);
    await this.loadDefaultLayout();
  }

  async resetLayout(): Promise<void> {
    if (!this.layout) {
      throw new Error('LayoutManager has not been initialized');
    }

    await this.loadDefaultLayout();
  }

  private async loadDefaultLayout(): Promise<void> {
    if (!this.layout) {
      throw new Error('LayoutManager has not been initialized');
    }

    this.layout.loadLayout(DEFAULT_LAYOUT_CONFIG);

    // Inline logic from InitializeLayoutCommand
    const previousLayoutReady = this.state.ui.isLayoutReady;
    const previousPanelVisibility = { ...this.state.ui.panelVisibility };
    const previousFocusedPanelId = this.state.ui.focusedPanelId;

    const nextPanelVisibility = { ...DEFAULT_PANEL_VISIBILITY };
    const nextFocusedPanelId = 'viewport';

    const didMutate =
      previousLayoutReady === false ||
      !(
        previousPanelVisibility.sceneTree === nextPanelVisibility.sceneTree &&
        previousPanelVisibility.viewport === nextPanelVisibility.viewport &&
        previousPanelVisibility.inspector === nextPanelVisibility.inspector &&
        previousPanelVisibility.assetBrowser === nextPanelVisibility.assetBrowser
      ) ||
      previousFocusedPanelId !== nextFocusedPanelId;

    if (!didMutate) {
      return;
    }

    this.state.ui.isLayoutReady = true;
    this.state.ui.panelVisibility = nextPanelVisibility;
    this.state.ui.focusedPanelId = nextFocusedPanelId;
  }

  dispose(): void {
    if (this.layout) {
      try {
        this.layout.destroy();
      } catch (error) {
        console.error('[LayoutManager] Failed to dispose layout', error);
      }
    }
    this.layout = null;
    this.container = null;
  }

  private registerComponents(layout: GoldenLayout): void {
    Object.entries(PANEL_TAG_NAMES).forEach(([componentType, tagName]) => {
      layout.registerComponentFactoryFunction(componentType, container => {
        container.setTitle(PANEL_DISPLAY_TITLES[componentType as PanelComponentType]);
        const element = document.createElement(tagName);
        element.setAttribute('data-panel-id', componentType);
        container.element.append(element);
        container.on('destroy', () => {
          element.remove();
        });
      });
    });
  }
}
