import { injectable, inject } from '@/fw/di';
import { appState, type EditorTab, type EditorTabType } from '@/state';
import { LayoutManagerService } from '@/core/LayoutManager';
import { DialogService } from '@/services/DialogService';
import { CommandDispatcher } from '@/services/CommandDispatcher';
import { LoadSceneCommand } from '@/features/scene/LoadSceneCommand';
import { SaveSceneCommand } from '@/features/scene/SaveSceneCommand';
import { ViewportRendererService } from '@/services/ViewportRenderService';
import { OperationService } from '@/services/OperationService';
import { SetPlayModeOperation } from '@/features/scripts/SetPlayModeOperation';
import { SceneManager } from '@pix3/runtime';
import { subscribe } from 'valtio/vanilla';

export type DirtyCloseDecision = 'save' | 'dont-save' | 'cancel';

@injectable()
export class EditorTabService {
  @inject(LayoutManagerService)
  private readonly layoutManager!: LayoutManagerService;

  @inject(DialogService)
  private readonly dialogService!: DialogService;

  @inject(CommandDispatcher)
  private readonly commandDispatcher!: CommandDispatcher;

  @inject(ViewportRendererService)
  private readonly viewportRenderer!: ViewportRendererService;

  @inject(SceneManager)
  private readonly sceneManager!: SceneManager;

  @inject(OperationService)
  private readonly operationService!: OperationService;

  private disposeSceneSubscription?: () => void;
  private disposeLayoutSubscription?: () => void;
  private disposeTabsSubscription?: () => void;
  private handleBeforeUnload?: (e: BeforeUnloadEvent) => void;

  initialize(): void {
    if (this.disposeSceneSubscription) return;

    // Keep tab titles in sync with scene descriptor dirty state.
    this.disposeSceneSubscription = subscribe(appState.scenes, () => {
      this.syncSceneTabsFromDescriptors();
    });

    this.disposeLayoutSubscription = this.layoutManager.subscribeEditorTabFocused(tabId => {
      void this.handleGoldenLayoutTabFocused(tabId);
    });

    // Route Golden Layout tab close (x) through our close flow.
    this.layoutManager.subscribeEditorTabCloseRequested(tabId => {
      void this.closeTab(tabId);
    });

    // Persist open tabs and active tab per project.
    this.disposeTabsSubscription = subscribe(
      appState.tabs,
      () => {
        const projectId = appState.project.id;
        if (!projectId) return;

        const session = {
          tabs: appState.tabs.tabs
            .filter(t => !t.resourceId.startsWith('templ://') && t.type !== 'game')
            .map(t => ({
              resourceId: t.resourceId,
              type: t.type,
              title: t.title,
              contextState: t.contextState,
            })),
          activeTabId: appState.tabs.activeTabId,
        };

        try {
          localStorage.setItem(`pix3.projectTabs:${projectId}`, JSON.stringify(session));
        } catch (e) {
          console.error('[EditorTabService] Failed to persist tabs session', e);
        }
      },
      true // deep subscription to catch contextState changes
    );

    this.handleBeforeUnload = (e: BeforeUnloadEvent) => {
      this.captureActiveContextState();

      // Prompt the user if any scene tab has unsaved changes.
      if (!appState.ui.warnOnUnsavedUnload) {
        return;
      }

      const hasDirty = appState.tabs.tabs.some(t => t.isDirty);
      if (hasDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }

  dispose(): void {
    this.disposeSceneSubscription?.();
    this.disposeSceneSubscription = undefined;
    this.disposeLayoutSubscription?.();
    this.disposeLayoutSubscription = undefined;
    this.disposeTabsSubscription?.();
    this.disposeTabsSubscription = undefined;
    if (this.handleBeforeUnload) {
      window.removeEventListener('beforeunload', this.handleBeforeUnload);
      this.handleBeforeUnload = undefined;
    }
  }

  async openResourceTab(
    type: EditorTabType,
    resourceId: string,
    contextState?: EditorTab['contextState'],
    activate = true
  ): Promise<EditorTab> {
    this.initialize();

    const tabId = this.deriveTabId(type, resourceId);
    const existing = appState.tabs.tabs.find(t => t.id === tabId);
    if (existing) {
      if (activate) {
        this.layoutManager.ensureEditorTab(existing);
        await this.focusTab(existing.id);
      } else {
        // Even if not activating, ensure GL component exists if it's already in state
        this.layoutManager.ensureEditorTab(existing);
      }
      return existing;
    }

    const tab: EditorTab = {
      id: tabId,
      type,
      resourceId,
      title: this.deriveTitle(resourceId),
      isDirty: false,
      contextState: contextState ?? {},
    };

    appState.tabs.tabs = [...appState.tabs.tabs, tab];

    this.layoutManager.ensureEditorTab(tab);
    // focusEditorTab is now called asynchronously inside ensureEditorTab after the component factory runs

    if (activate) {
      await this.activateTab(tab.id);
    }

    return tab;
  }

  async focusOrOpenScene(resourcePath: string): Promise<void> {
    await this.openResourceTab('scene', resourcePath);
  }

  async restoreProjectSession(projectId: string): Promise<boolean> {
    const raw = localStorage.getItem(`pix3.projectTabs:${projectId}`);
    if (!raw) return false;

    try {
      const session = JSON.parse(raw);
      if (!session || !Array.isArray(session.tabs)) return false;

      // Skip template tabs (templ://) — they should not be restored.
      const tabsToRestore = (
        session.tabs as Array<{
          type: string;
          resourceId: string;
          contextState?: EditorTab['contextState'];
        }>
      ).filter((t: { resourceId: string; type: string }) => {
        if (t.resourceId.startsWith('templ://')) return false;
        if (t.type === 'game') return false;
        return true;
      });
      for (const tabData of tabsToRestore) {
        await this.openResourceTab(
          tabData.type as EditorTabType,
          tabData.resourceId,
          tabData.contextState,
          false // don't activate yet
        );
      }

      if (session.activeTabId) {
        await this.focusTab(session.activeTabId);
      } else if (tabsToRestore.length > 0) {
        const firstTabId = this.deriveTabId(
          tabsToRestore[0].type as EditorTabType,
          tabsToRestore[0].resourceId
        );
        await this.focusTab(firstTabId);
      }

      return tabsToRestore.length > 0;
    } catch (e) {
      console.error('[EditorTabService] Failed to restore project session', e);
      return false;
    }
  }

  async closeTab(tabId: string): Promise<void> {
    const tab = appState.tabs.tabs.find(t => t.id === tabId);
    if (!tab) {
      return;
    }

    if (tab.isDirty) {
      const decision = await this.promptDirtyClose(tab);
      if (decision === 'cancel') {
        this.layoutManager.focusEditorTab(tabId);
        return;
      }
      if (decision === 'save') {
        await this.saveTabResource(tab);
      }
    }

    if (tab.type === 'game') {
      await this.operationService.invoke(
        new SetPlayModeOperation({
          isPlaying: false,
          status: 'stopped',
        })
      );
    }

    // If closing active tab, save camera/selection before removal.
    if (appState.tabs.activeTabId === tabId) {
      this.captureActiveContextState();
    }

    // Clean up scene data if it's a scene tab.
    if (tab.type === 'scene') {
      const sceneId = this.deriveSceneIdFromResource(tab.resourceId);

      // Remove from state.
      delete appState.scenes.descriptors[sceneId];
      delete appState.scenes.hierarchies[sceneId];
      if (appState.scenes.cameraStates[sceneId]) {
        delete appState.scenes.cameraStates[sceneId];
      }

      if (appState.scenes.activeSceneId === sceneId) {
        appState.scenes.activeSceneId = null;

        // Clear selection when active scene is removed.
        appState.selection.nodeIds = [];
        appState.selection.primaryNodeId = null;
        appState.selection.hoveredNodeId = null;
      }

      // Remove from runtime.
      this.sceneManager.removeSceneGraph(sceneId);
    }

    appState.tabs.tabs = appState.tabs.tabs.filter(t => t.id !== tabId);

    // Select a next tab if needed.
    if (appState.tabs.activeTabId === tabId) {
      const next = appState.tabs.tabs[appState.tabs.tabs.length - 1] ?? null;
      appState.tabs.activeTabId = null;
      if (next) {
        await this.activateTab(next.id);
      }
    }

    this.layoutManager.removeEditorTab(tabId);
  }

  async focusTab(tabId: string): Promise<void> {
    const tab = appState.tabs.tabs.find(t => t.id === tabId);
    if (!tab) return;

    this.layoutManager.focusEditorTab(tabId);
    await this.activateTab(tabId);
  }

  async handleGoldenLayoutTabFocused(tabId: string): Promise<void> {
    await this.activateTab(tabId);
  }

  private async activateTab(tabId: string): Promise<void> {
    const next = appState.tabs.tabs.find(t => t.id === tabId);
    if (!next) return;

    const previousId = appState.tabs.activeTabId;

    // Capture state from previous active tab before switching.
    if (previousId && previousId !== tabId) {
      this.captureActiveContextState();
    }

    appState.tabs.activeTabId = tabId;

    if (next.type === 'scene') {
      await this.activateSceneTab(next);
    }
  }

  private async activateSceneTab(tab: EditorTab): Promise<void> {
    const sceneId = this.deriveSceneIdFromResource(tab.resourceId);

    // Load if needed.
    const alreadyLoaded = Boolean(appState.scenes.descriptors[sceneId]);
    if (!alreadyLoaded) {
      const command = new LoadSceneCommand({ filePath: tab.resourceId, sceneId });
      await this.commandDispatcher.execute(command);
    } else {
      appState.scenes.activeSceneId = sceneId;
    }

    // Restore selection (per-tab) into global selection state.
    const selection = tab.contextState?.selection;
    if (selection) {
      appState.selection.nodeIds = [...selection.nodeIds];
      appState.selection.primaryNodeId = selection.primaryNodeId;
    }

    // Restore camera state into renderer.
    const camera = tab.contextState?.camera;
    if (camera) {
      this.viewportRenderer.applyCameraState(camera);
    } else {
      const sceneCamera = appState.scenes.cameraStates[sceneId];
      if (sceneCamera) {
        this.viewportRenderer.applyCameraState(sceneCamera);
      }
    }

    // Sync title now that descriptor is available.
    this.syncSceneTabsFromDescriptors();
  }

  private captureActiveContextState(): void {
    const activeTabId = appState.tabs.activeTabId;
    if (!activeTabId) return;
    const tab = appState.tabs.tabs.find(t => t.id === activeTabId);
    if (!tab) return;

    if (tab.type === 'scene') {
      const sceneId = this.deriveSceneIdFromResource(tab.resourceId);

      // Save camera state.
      const camera = this.viewportRenderer.captureCameraState();
      if (camera) {
        tab.contextState = { ...(tab.contextState ?? {}), camera };
        appState.scenes.cameraStates[sceneId] = camera;
      }

      // Save selection state.
      tab.contextState = {
        ...(tab.contextState ?? {}),
        selection: {
          nodeIds: [...appState.selection.nodeIds],
          primaryNodeId: appState.selection.primaryNodeId,
        },
      };
    }
  }

  private async saveTabResource(tab: EditorTab): Promise<void> {
    if (tab.type !== 'scene') return;

    const sceneId = this.deriveSceneIdFromResource(tab.resourceId);
    const command = new SaveSceneCommand({ sceneId });
    await this.commandDispatcher.execute(command);
  }

  private async promptDirtyClose(tab: EditorTab): Promise<DirtyCloseDecision> {
    const choice = await this.dialogService.showChoice({
      title: 'Unsaved Changes',
      message: `Save changes to ${tab.title}?`,
      confirmLabel: 'Save',
      secondaryLabel: "Don't Save",
      cancelLabel: 'Cancel',
      isDangerous: false,
      secondaryIsDangerous: true,
    });

    if (choice === 'confirm') return 'save';
    if (choice === 'secondary') return 'dont-save';
    return 'cancel';
  }

  private syncSceneTabsFromDescriptors(): void {
    // Keep tab.isDirty/title aligned with scene descriptor state.
    let didChange = false;
    const nextTabs = appState.tabs.tabs.map(tab => {
      if (tab.type !== 'scene') return tab;
      const sceneId = this.deriveSceneIdFromResource(tab.resourceId);
      const descriptor = appState.scenes.descriptors[sceneId];
      if (!descriptor) return tab;

      const fileTitle = this.deriveTitle(descriptor.filePath);
      const title = descriptor.isDirty ? `*${fileTitle}` : fileTitle;
      const isDirty = descriptor.isDirty;

      if (tab.title !== title || tab.isDirty !== isDirty) {
        didChange = true;
        const updated: EditorTab = { ...tab, title, isDirty };
        this.layoutManager.updateEditorTabTitle(updated.id, updated.title);
        return updated;
      }

      // Make sure GL title stays in sync even if state didn't change (e.g. restored tabs).
      this.layoutManager.updateEditorTabTitle(tab.id, tab.title);
      return tab;
    });

    if (didChange) {
      appState.tabs.tabs = nextTabs;
    }
  }

  private deriveTabId(type: EditorTabType, resourceId: string): string {
    return `${type}:${resourceId}`;
  }

  private deriveTitle(resourceId: string): string {
    if (resourceId === 'game-view-instance') {
      return 'Game';
    }
    const normalized = resourceId.replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    return segments.length ? segments[segments.length - 1] : resourceId;
  }

  private deriveSceneIdFromResource(resourcePath: string): string {
    const withoutScheme = resourcePath.replace(/^res:\/\//i, '').replace(/^templ:\/\//i, '');
    const withoutExtension = withoutScheme.replace(/\.[^./]+$/i, '');
    const normalized = withoutExtension
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    return normalized || 'scene';
  }
}
