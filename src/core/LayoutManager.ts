import { GoldenLayout, type LayoutConfig } from 'golden-layout';
import { injectable } from '@/fw/di';
import { appState, type AppState, type PanelVisibilityState } from '@/state';

const PANEL_COMPONENT_TYPES = {
  sceneTree: 'scene-tree',
  viewport: 'viewport',
  inspector: 'inspector',
  assetBrowser: 'asset-browser',
  logs: 'logs',
} as const;

export type PanelComponentType = (typeof PANEL_COMPONENT_TYPES)[keyof typeof PANEL_COMPONENT_TYPES];

const PANEL_TAG_NAMES: Record<PanelComponentType, keyof HTMLElementTagNameMap> = {
  [PANEL_COMPONENT_TYPES.sceneTree]: 'pix3-scene-tree-panel',
  [PANEL_COMPONENT_TYPES.viewport]: 'pix3-viewport-panel',
  [PANEL_COMPONENT_TYPES.inspector]: 'pix3-inspector-panel',
  [PANEL_COMPONENT_TYPES.assetBrowser]: 'pix3-asset-browser-panel',
  [PANEL_COMPONENT_TYPES.logs]: 'pix3-logs-panel',
};

const PANEL_DISPLAY_TITLES: Record<PanelComponentType, string> = {
  [PANEL_COMPONENT_TYPES.sceneTree]: 'Scene Tree',
  [PANEL_COMPONENT_TYPES.viewport]: 'Viewport',
  [PANEL_COMPONENT_TYPES.inspector]: 'Inspector',
  [PANEL_COMPONENT_TYPES.assetBrowser]: 'Asset Browser',
  [PANEL_COMPONENT_TYPES.logs]: 'Logs',
};

const DEFAULT_PANEL_VISIBILITY: PanelVisibilityState = {
  sceneTree: true,
  viewport: true,
  inspector: true,
  assetBrowser: true,
  logs: true,
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
        width: 20,
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
        type: 'column',
        width: 50,
        content: [
          {
            type: 'stack',
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
            componentType: PANEL_COMPONENT_TYPES.logs,
            title: PANEL_DISPLAY_TITLES[PANEL_COMPONENT_TYPES.logs],
            height: 25,
            isClosable: true,
          },
        ],
      },

      {
        type: 'component',
        width: 30,
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
  private viewportContainer: any = null;
  private viewportStack: any = null; // Reference to the main viewport stack for multi-tab support

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

  /**
   * Update the viewport tab title to reflect the active scene name or file name.
   */
  setViewportTitle(title: string): void {
    if (this.viewportContainer) {
      this.viewportContainer.setTitle(title);
    }
  }

  /**
   * Open a scene or prefab in a new viewport tab (or focus existing tab).
   * @param sceneId - Unique identifier for the scene
   * @param title - Display title for the tab
   */
  openSceneTab(sceneId: string, title: string): void {
    if (!this.layout || !this.viewportStack) {
      console.warn('[LayoutManager] Cannot open scene tab: layout not initialized');
      return;
    }

    // Check if a tab with this sceneId already exists
    const existingComponent = this.findComponentBySceneId(sceneId);
    if (existingComponent) {
      // Focus the existing tab
      existingComponent.focus();
      console.log('[LayoutManager] Focused existing tab for scene:', sceneId);
      return;
    }

    // Add a new viewport tab to the stack
    try {
      // In Golden Layout 2.x, we need to use newItemAtLocation to create a component
      // The stack needs a location-based API call rather than direct addChild
      const componentConfig = {
        type: 'component' as const,
        componentType: PANEL_COMPONENT_TYPES.viewport,
        title: title,
        isClosable: true,
        componentState: {
          sceneId: sceneId,
        },
      };
      
      // Use the layout's API to add the item at the stack's location
      // This properly creates and registers the component
      const location = {
        parentId: this.viewportStack.id,
      };
      
      this.layout.newItemAtLocation(componentConfig, location);
      console.log('[LayoutManager] Opened new tab for scene:', sceneId);
    } catch (error) {
      console.error('[LayoutManager] Failed to open scene tab:', error);
      // Fallback: just load the scene in the current viewport without creating a new tab
      console.warn('[LayoutManager] Falling back to loading scene in current viewport');
    }
  }

  /**
   * Find a viewport component by sceneId
   */
  private findComponentBySceneId(sceneId: string): any | null {
    if (!this.layout) {
      return null;
    }

    // Search through all components in the layout
    const findInContainer = (container: any): any | null => {
      if (!container) return null;
      
      // Check if this is a component with matching sceneId
      if (container.componentType === PANEL_COMPONENT_TYPES.viewport) {
        const state = container.state || container.componentState;
        if (state?.sceneId === sceneId) {
          return container;
        }
      }

      // Recursively search children
      if (container.contentItems) {
        for (const child of container.contentItems) {
          const found = findInContainer(child);
          if (found) return found;
        }
      }

      return null;
    };

    return findInContainer(this.layout.rootItem);
  }

  private async loadDefaultLayout(): Promise<void> {
    if (!this.layout) {
      throw new Error('LayoutManager has not been initialized');
    }

    this.layout.loadLayout(DEFAULT_LAYOUT_CONFIG);

    // Find and store the viewport stack after layout is loaded
    this.findAndStoreViewportStack();

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

  /**
   * Find and store the viewport stack reference after layout is loaded
   */
  private findAndStoreViewportStack(): void {
    if (!this.layout) return;

    const findViewportStack = (item: any): any | null => {
      if (!item) return null;

      // Check if this is a stack containing a viewport component
      if (item.type === 'stack' && item.contentItems) {
        for (const child of item.contentItems) {
          if (child.componentType === PANEL_COMPONENT_TYPES.viewport) {
            return item;
          }
        }
      }

      // Recursively search children
      if (item.contentItems) {
        for (const child of item.contentItems) {
          const found = findViewportStack(child);
          if (found) return found;
        }
      }

      return null;
    };

    this.viewportStack = findViewportStack(this.layout.rootItem);
    
    if (this.viewportStack) {
      console.log('[LayoutManager] Viewport stack found and stored');
    } else {
      console.warn('[LayoutManager] Viewport stack not found in layout');
    }
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

        // Store reference to viewport container for dynamic title updates
        if (componentType === PANEL_COMPONENT_TYPES.viewport) {
          this.viewportContainer = container;
          // Store the parent stack for multi-tab support
          if (container.parent?.type === 'stack') {
            this.viewportStack = container.parent;
          }
        }

        const element = document.createElement(tagName);
        element.setAttribute('data-panel-id', componentType);
        // Pass componentState to the element for sceneId support
        if (container.state) {
          Object.entries(container.state).forEach(([key, value]) => {
            element.setAttribute(`data-${key}`, String(value));
          });
        }
        container.element.append(element);
        container.on('destroy', () => {
          element.remove();
        });
      });
    });
  }
}
