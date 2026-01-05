import {
  GoldenLayout,
  type LayoutConfig,
  type ContentItem,
  type Stack,
  type ComponentItem,
} from 'golden-layout';
import { injectable } from '@/fw/di';
import { appState, type AppState, type EditorTab, type PanelVisibilityState } from '@/state';

const PANEL_COMPONENT_TYPES = {
  sceneTree: 'scene-tree',
  viewport: 'viewport',
  inspector: 'inspector',
  assetBrowser: 'asset-browser',
  logs: 'logs',
  background: 'background',
} as const;

export type PanelComponentType = (typeof PANEL_COMPONENT_TYPES)[keyof typeof PANEL_COMPONENT_TYPES];

const PANEL_TAG_NAMES = {
  [PANEL_COMPONENT_TYPES.sceneTree]: 'pix3-scene-tree-panel',
  [PANEL_COMPONENT_TYPES.viewport]: 'pix3-editor-tab',
  [PANEL_COMPONENT_TYPES.inspector]: 'pix3-inspector-panel',
  [PANEL_COMPONENT_TYPES.assetBrowser]: 'pix3-asset-browser-panel',
  [PANEL_COMPONENT_TYPES.logs]: 'pix3-logs-panel',
  [PANEL_COMPONENT_TYPES.background]: 'pix3-background',
} as const;

const PANEL_DISPLAY_TITLES: Record<PanelComponentType, string> = {
  [PANEL_COMPONENT_TYPES.sceneTree]: 'Scene Tree',
  [PANEL_COMPONENT_TYPES.viewport]: 'Viewport',
  [PANEL_COMPONENT_TYPES.inspector]: 'Inspector',
  [PANEL_COMPONENT_TYPES.assetBrowser]: 'Asset Browser',
  [PANEL_COMPONENT_TYPES.logs]: 'Logs',
  [PANEL_COMPONENT_TYPES.background]: 'Pix3',
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
            id: 'editor-stack',
            content: [
              {
                type: 'component',
                componentType: PANEL_COMPONENT_TYPES.background,
                title: PANEL_DISPLAY_TITLES[PANEL_COMPONENT_TYPES.background],
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
  private editorStack: Stack | null = null;
  private editorTabContainers = new Map<string, ComponentItem>();
  private editorTabItems = new Map<string, ComponentItem>();
  private editorTabFocusedListeners = new Set<(tabId: string) => void>();
  private editorTabCloseRequestedListeners = new Set<(tabId: string) => void>();

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

    // Clear cached stack reference so it's re-discovered after layout reset.
    this.editorStack = null;
    this.editorTabContainers.clear();
    this.editorTabItems.clear();

    await this.loadDefaultLayout();
  }

  /**
   * Backwards compatible method for the (single-tab) viewport.
   * With multi-tab, prefer updateEditorTabTitle(tabId, title).
   */
  setViewportTitle(title: string): void {
    // If there is an active editor tab, update that title.
    const activeTabId = appState.tabs.activeTabId;
    if (activeTabId) {
      this.updateEditorTabTitle(activeTabId, title);
    }
  }

  subscribeEditorTabFocused(listener: (tabId: string) => void): () => void {
    this.editorTabFocusedListeners.add(listener);
    return () => this.editorTabFocusedListeners.delete(listener);
  }

  subscribeEditorTabCloseRequested(listener: (tabId: string) => void): () => void {
    this.editorTabCloseRequestedListeners.add(listener);
    return () => this.editorTabCloseRequestedListeners.delete(listener);
  }

  ensureEditorTab(tab: EditorTab): void {
    if (!this.layout) return;
    this.ensureEditorStack();
    if (!this.editorStack) return;

    // Reconcile our bookkeeping with Golden Layout: the app can keep a tab in state even if the
    // corresponding GL item was closed/destroyed (or not tracked due to async timing).
    try {
      const root = (this.layout as any).rootItem;
      const itemInLayout = this.findViewportByTabId(root, tab.id);
      if (itemInLayout) {
        this.editorTabItems.set(tab.id, itemInLayout);
        this.updateEditorTabTitle(tab.id, tab.title);
        return;
      }

      // If we thought we had it, but it doesn't exist in the layout tree anymore, drop stale refs.
      if (this.editorTabItems.has(tab.id)) {
        this.editorTabItems.delete(tab.id);
      }
      if (this.editorTabContainers.has(tab.id)) {
        this.editorTabContainers.delete(tab.id);
      }
    } catch {
      // ignore, fall through to normal add path
    }

    // Create a new component item inside the editor stack.
    try {
      console.log('[LayoutManager] Adding tab to editor stack:', {
        tabId: tab.id,
        title: tab.title,
      });
      const index = this.editorStack.addItem(
        {
          type: 'component',
          componentType: PANEL_COMPONENT_TYPES.viewport,
          title: tab.title,
          isClosable: true,
          componentState: {
            tabId: tab.id,
          },
        },
        undefined
      );

      console.log('[LayoutManager] addItem returned index:', index);

      // Log all content items in the stack after adding
      console.log('[LayoutManager] Stack content items after add:');
      if (this.editorStack && this.editorStack.contentItems) {
        for (let i = 0; i < this.editorStack.contentItems.length; i++) {
          const item = this.editorStack.contentItems[i];
          console.log(
            '[LayoutManager]   Item',
            i,
            '- type:',
            item.type,
            'component:',
            item.componentType,
            'tabId:',
            (item.container?.state as any)?.tabId
          );
        }
      }

      // Best-effort: capture the newly created item.
      const created = this.editorStack.contentItems?.[index];
      if (created) {
        console.log('[LayoutManager] Captured newly created item');
        this.editorTabItems.set(tab.id, created);
      } else {
        console.log('[LayoutManager] Could not capture newly created item at index', index);
      }

      // Use a small timeout to ensure the component factory has run
      // Golden Layout renders asynchronously and the component instance needs time to be created
      setTimeout(() => {
        console.log('[LayoutManager] Attempting async focus for tab:', tab.id);
        this.focusEditorTab(tab.id);
      }, 50);
    } catch (error) {
      console.error('[LayoutManager] Failed to add editor tab', error);
    }
  }

  removeEditorTab(tabId: string): void {
    const item = this.editorTabItems.get(tabId);
    if (!item) {
      this.editorTabContainers.delete(tabId);
      return;
    }
    try {
      console.log('[LayoutManager] Removing editor tab:', tabId);
      item.close();
    } catch {
      try {
        item.destroy?.();
      } catch {
        // ignore
      }
    }
    this.editorTabItems.delete(tabId);
    this.editorTabContainers.delete(tabId);
  }

  focusEditorTab(tabId: string): void {
    if (!this.layout) return;
    this.ensureEditorStack();

    let item = this.editorTabItems.get(tabId);

    // Fallback: if map is not yet updated, search the tree manually
    if (!item) {
      console.log('[LayoutManager] Item not in map, searching tree...');
      item = this.findViewportByTabId((this.layout as any).rootItem, tabId);
      if (item) {
        console.log('[LayoutManager] Found item in tree');
        this.editorTabItems.set(tabId, item);
      }
    }

    // Final fallback: search contentItems directly (helps with recently added tabs)
    if (!item && this.editorStack && this.editorStack.contentItems) {
      console.log('[LayoutManager] Searching editor stack content items...');
      for (const contentItem of this.editorStack.contentItems) {
        const itemTabId = (contentItem.container?.state as any)?.tabId;
        if (
          contentItem.type === 'component' &&
          contentItem.componentType === PANEL_COMPONENT_TYPES.viewport &&
          itemTabId === tabId
        ) {
          item = contentItem;
          console.log('[LayoutManager] Found item in editor stack');
          this.editorTabItems.set(tabId, item);
          break;
        }
      }
    }

    if (!item) {
      console.log('[LayoutManager] Item not found, skipping focus');
      return;
    }

    console.log('[LayoutManager] Found item, attempting to focus...');

    try {
      if (item.parent && typeof item.parent.setActiveComponentItem === 'function') {
        console.log('[LayoutManager] Calling setActiveComponentItem on parent');
        item.parent.setActiveComponentItem(item, true);
      } else {
        console.log('[LayoutManager] Parent or method not available, trying direct stack focus');
        // If parent not available, try to find the parent stack from the item
        const parentStack = this.findClosestStack(item);
        if (parentStack && typeof parentStack.setActiveComponentItem === 'function') {
          console.log('[LayoutManager] Found parent stack, calling setActiveComponentItem');
          parentStack.setActiveComponentItem(item, true);
        }
      }
    } catch (error) {
      console.error('[LayoutManager] Error focusing tab:', error);
    }
  }

  private findViewportByTabId(node: ContentItem | null, tabId: string): ContentItem | null {
    if (!node) return null;
    if (
      node.type === 'component' &&
      (node as ComponentItem).componentType === PANEL_COMPONENT_TYPES.viewport &&
      ((node as ComponentItem).container?.state as { tabId?: string })?.tabId === tabId
    ) {
      return node;
    }
    const children: ContentItem[] = (node as { contentItems?: ContentItem[] }).contentItems ?? [];
    for (const child of children) {
      const found = this.findViewportByTabId(child, tabId);
      if (found) return found;
    }
    return null;
  }

  updateEditorTabTitle(tabId: string, title: string): void {
    const container = this.editorTabContainers.get(tabId);
    if (container) {
      try {
        container.setTitle(title);
      } catch {
        // ignore
      }
      return;
    }

    const item = this.editorTabItems.get(tabId);
    if (item) {
      try {
        item.setTitle?.(title);
      } catch {
        // ignore
      }
    }
  }

  private async loadDefaultLayout(): Promise<void> {
    if (!this.layout) {
      throw new Error('LayoutManager has not been initialized');
    }

    this.layout.loadLayout(DEFAULT_LAYOUT_CONFIG);

    this.ensureEditorStack();

    // Track active editor tab focus changes.
    try {
      this.layout.on('activeContentItemChanged' as 'stateChanged', (item: ComponentItem) => {
        try {
          const componentType = item?.componentType;
          if (
            componentType !== PANEL_COMPONENT_TYPES.viewport &&
            componentType !== PANEL_COMPONENT_TYPES.background
          )
            return;

          // IMPORTANT: Invalidate the cached editorStack because the active content changed
          // This ensures we get fresh contentItems array when reopening tabs after close
          this.editorStack = null;
          this.ensureEditorStack();

          // Track the current "main editor" stack so new tabs open in the same area.
          const parentStack = this.findClosestStack(item);
          if (parentStack) {
            this.editorStack = parentStack;
          }

          if (componentType !== PANEL_COMPONENT_TYPES.viewport) return;

          const tabId = item?.container?.state?.tabId;
          if (typeof tabId !== 'string' || !tabId) return;
          for (const listener of this.editorTabFocusedListeners) {
            listener(tabId);
          }
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }

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

        if (componentType === PANEL_COMPONENT_TYPES.viewport) {
          const tabId = (container.state as any)?.tabId;
          if (typeof tabId === 'string' && tabId) {
            this.editorTabContainers.set(tabId, container);

            // Override GoldenLayout close so we can show Save/Don't Save/Cancel for dirty tabs.
            // GoldenLayout's default close is synchronous; we keep the tab open and only remove
            // it after EditorTabService confirms.
            try {
              const originalClose = container.close.bind(container);
              (container as any).close = () => {
                // If no one is listening yet (early init), fall back to default close.
                if (this.editorTabCloseRequestedListeners.size === 0) {
                  originalClose();
                  return;
                }

                for (const listener of this.editorTabCloseRequestedListeners) {
                  try {
                    listener(tabId);
                  } catch {
                    // ignore
                  }
                }
              };
              // Keep a reference in case we need to fall back to original behavior.
              (container as any).__pix3OriginalClose = originalClose;
            } catch {
              // ignore
            }

            try {
              const parent = (container as any)._parent;
              if (parent) {
                this.editorTabItems.set(tabId, parent);
              }
            } catch {
              // ignore
            }
          }
        }

        const element = document.createElement(tagName);
        element.setAttribute('data-panel-id', componentType);

        // Forward tab id into the element for the editor-tab component.
        if (componentType === PANEL_COMPONENT_TYPES.viewport) {
          const tabId = (container.state as any)?.tabId;
          if (typeof tabId === 'string' && tabId) {
            element.setAttribute('tab-id', tabId);
          }
        }

        container.element.append(element);
        container.on('destroy', () => {
          try {
            if (componentType === PANEL_COMPONENT_TYPES.viewport) {
              const tabId = (container.state as any)?.tabId;
              if (typeof tabId === 'string' && tabId) {
                this.editorTabContainers.delete(tabId);
                this.editorTabItems.delete(tabId);
              }
            }
          } catch {
            // ignore
          }
          element.remove();
        });
      });
    });
  }

  private ensureEditorStack(): void {
    if (!this.layout) return;

    try {
      const root = (this.layout as any).rootItem;
      // Find the stack by its known id 'editor-stack'.
      const editorStackById = this.findStackById(root, 'editor-stack');
      if (editorStackById) {
        this.editorStack = editorStackById;
        return;
      }
      // Fallback: find stack that owns a viewport or background component (main editor area).
      const mainStack = this.findMainEditorStack(root);
      this.editorStack = mainStack ?? this.findFirstStack(root);
    } catch (error) {
      console.error('[LayoutManager] Error in ensureEditorStack:', error);
      this.editorStack = null;
    }
  }

  private findStackById(node: ContentItem | null, id: string): Stack | null {
    if (!node) return null;
    if (node.type === 'stack' && node.id === id) return node as Stack;
    const children: ContentItem[] = (node as { contentItems?: ContentItem[] }).contentItems ?? [];
    for (const child of children) {
      const found = this.findStackById(child, id);
      if (found) return found;
    }
    return null;
  }

  private findClosestStack(node: ContentItem | null): Stack | null {
    if (!node) return null;
    let current: ContentItem | null = node;
    while (current) {
      if (current.type === 'stack') return current as Stack;
      current = current.parent ?? (current as { _parent?: ContentItem })._parent ?? null;
    }
    return null;
  }

  private findMainEditorStack(node: ContentItem | null): Stack | null {
    if (!node) return null;

    if (
      node.type === 'component' &&
      ((node as ComponentItem).componentType === PANEL_COMPONENT_TYPES.viewport ||
        (node as ComponentItem).componentType === PANEL_COMPONENT_TYPES.background)
    ) {
      return this.findClosestStack(node.parent ?? (node as { _parent?: ContentItem })._parent ?? null);
    }

    const children: ContentItem[] = (node as { contentItems?: ContentItem[] }).contentItems ?? [];
    for (const child of children) {
      const found = this.findMainEditorStack(child);
      if (found) return found;
    }

    return null;
  }

  private findFirstStack(node: ContentItem | null): Stack | null {
    if (!node) return null;
    if (node.type === 'stack') return node as Stack;
    const children: ContentItem[] = (node as { contentItems?: ContentItem[] }).contentItems ?? [];
    for (const child of children) {
      const found = this.findFirstStack(child);
      if (found) return found;
    }
    return null;
  }
}
