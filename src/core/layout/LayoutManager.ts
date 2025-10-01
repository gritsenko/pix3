import { GoldenLayout, type LayoutConfig } from 'golden-layout';
import { subscribeKey } from 'valtio/vanilla/utils';

import { injectable, ServiceContainer } from '@/fw/di';
import { appState, type AppState, type PersonaId, type PanelVisibilityState } from '@/state';
import { ApplyLayoutPresetCommand } from '@/core/commands/layout/ApplyLayoutPresetCommand';
import { createCommandContext, snapshotState } from '@/core/commands/command';

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

interface PersonaPresetDefinition {
  readonly persona: PersonaId;
  readonly layout: LayoutConfig;
  readonly panelVisibility: PanelVisibilityState;
}

const presetLayout = (persona: PersonaId): LayoutConfig => {
  switch (persona) {
    case 'gameplay-engineer':
      return {
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
    case 'playable-ad-producer':
      return {
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
          type: 'column',
          content: [
            {
              type: 'row',
              height: 70,
              content: [
                {
                  type: 'component',
                  width: 25,
                  componentType: PANEL_COMPONENT_TYPES.sceneTree,
                  title: PANEL_DISPLAY_TITLES[PANEL_COMPONENT_TYPES.sceneTree],
                  isClosable: false,
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
            {
              type: 'component',
              height: 30,
              componentType: PANEL_COMPONENT_TYPES.assetBrowser,
              title: PANEL_DISPLAY_TITLES[PANEL_COMPONENT_TYPES.assetBrowser],
              isClosable: false,
            },
          ],
        },
      } satisfies LayoutConfig;
    case 'technical-artist':
    default:
      return {
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
              type: 'component',
              width: 22,
              componentType: PANEL_COMPONENT_TYPES.sceneTree,
              title: PANEL_DISPLAY_TITLES[PANEL_COMPONENT_TYPES.sceneTree],
              isClosable: false,
            },
            {
              type: 'stack',
              width: 56,
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
              type: 'column',
              width: 22,
              content: [
                {
                  type: 'component',
                  height: 60,
                  componentType: PANEL_COMPONENT_TYPES.inspector,
                  title: PANEL_DISPLAY_TITLES[PANEL_COMPONENT_TYPES.inspector],
                  isClosable: false,
                },
                {
                  type: 'component',
                  height: 40,
                  componentType: PANEL_COMPONENT_TYPES.assetBrowser,
                  title: PANEL_DISPLAY_TITLES[PANEL_COMPONENT_TYPES.assetBrowser],
                  isClosable: false,
                },
              ],
            },
          ],
        },
      } satisfies LayoutConfig;
  }
};

const personaPresets: Record<PersonaId, PersonaPresetDefinition> = {
  'technical-artist': {
    persona: 'technical-artist',
    layout: presetLayout('technical-artist'),
    panelVisibility: {
      sceneTree: true,
      viewport: true,
      inspector: true,
      assetBrowser: true,
    },
  },
  'gameplay-engineer': {
    persona: 'gameplay-engineer',
    layout: presetLayout('gameplay-engineer'),
    panelVisibility: {
      sceneTree: true,
      viewport: true,
      inspector: true,
      assetBrowser: true,
    },
  },
  'playable-ad-producer': {
    persona: 'playable-ad-producer',
    layout: presetLayout('playable-ad-producer'),
    panelVisibility: {
      sceneTree: true,
      viewport: true,
      inspector: true,
      assetBrowser: true,
    },
  },
};

@injectable()
export class LayoutManagerService {
  private layout: GoldenLayout | null = null;
  private readonly state: AppState;
  private container: HTMLElement | null = null;
  private unsubscribePersona?: () => void;
  private currentPersona: PersonaId | null = null;

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

    const persona = this.state.ui.layoutPresetId ?? this.state.ui.persona;
    await this.applyPersonaPreset(persona);

    this.unsubscribePersona?.();
    this.unsubscribePersona = subscribeKey(this.state.ui, 'layoutPresetId', nextPersona => {
      if (!nextPersona) {
        return;
      }
      if (this.currentPersona === nextPersona) {
        return;
      }
      void this.applyPersonaPreset(nextPersona);
    });
  }

  async applyPersonaPreset(persona: PersonaId): Promise<void> {
    if (this.currentPersona === persona && this.layout) {
      return;
    }

    const preset = personaPresets[persona];
    if (!preset) {
      console.warn(`[LayoutManager] Unknown persona preset: ${persona}`);
      return;
    }

    if (!this.layout) {
      throw new Error('LayoutManager has not been initialized');
    }

    this.layout.loadLayout(preset.layout);

    const command = new ApplyLayoutPresetCommand({
      persona,
      panelVisibility: preset.panelVisibility,
    });
    const context = createCommandContext(this.state, snapshotState(this.state));
    const preconditionsResult = command.preconditions?.(context) ?? { canExecute: true };
    const resolvedPreconditions = await Promise.resolve(preconditionsResult);
    if (!resolvedPreconditions.canExecute) {
      console.warn('[LayoutManager] Cannot apply layout preset:', resolvedPreconditions.reason);
      return;
    }
    const executionResult = await Promise.resolve(command.execute(context));
    if (executionResult.didMutate) {
      await command.postCommit?.(context, executionResult.payload);
    }

    this.currentPersona = persona;
  }

  dispose(): void {
    this.unsubscribePersona?.();
    this.unsubscribePersona = undefined;
    if (this.layout) {
      try {
        this.layout.destroy();
      } catch (error) {
        console.error('[LayoutManager] Failed to dispose layout', error);
      }
    }
    this.layout = null;
    this.container = null;
    this.currentPersona = null;
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

export const resolveLayoutManager = (): LayoutManagerService => {
  return ServiceContainer.getInstance().getService(
    ServiceContainer.getInstance().getOrCreateToken(LayoutManagerService)
  ) as LayoutManagerService;
};
