import { subscribe } from 'valtio/vanilla';

import { ComponentBase, customElement, html, inject, property, state } from '@/fw';
import { LayoutManagerService } from '@/core/LayoutManager';
import { OperationService } from '@/services/OperationService';
import { CommandDispatcher } from '@/services/CommandDispatcher';
import { CommandRegistry } from '@/services/CommandRegistry';
import { FileWatchService } from '@/services/FileWatchService';
import { DialogService, type DialogInstance } from '@/services/DialogService';
import {
  BehaviorPickerService,
  type ComponentPickerInstance,
} from '@/services/BehaviorPickerService';
import { ScriptCreatorService, type ScriptCreationInstance } from '@/services/ScriptCreatorService';
import { ScriptExecutionService } from '@/services/ScriptExecutionService';
import { ProjectScriptLoaderService } from '@/services/ProjectScriptLoaderService';
import { ScriptCompilerService } from '@/services/ScriptCompilerService';
import { SaveSceneCommand } from '@/features/scene/SaveSceneCommand';
import { SaveAsSceneCommand } from '@/features/scene/SaveAsSceneCommand';
import { ReloadSceneCommand } from '@/features/scene/ReloadSceneCommand';
import { DeleteObjectCommand } from '@/features/scene/DeleteObjectCommand';
import { UndoCommand } from '@/features/history/UndoCommand';
import { RedoCommand } from '@/features/history/RedoCommand';
import { PlaySceneCommand } from '@/features/scripts/PlaySceneCommand';
import { StopSceneCommand } from '@/features/scripts/StopSceneCommand';
import { appState } from '@/state';
import { ProjectService } from '@/services';
import { EditorTabService } from '@/services/EditorTabService';
import './shared/pix3-toolbar';
import './shared/pix3-toolbar-button';
import './shared/pix3-main-menu';
import './shared/pix3-confirm-dialog';
import './shared/pix3-behavior-picker';
import './shared/pix3-script-creator';
import './shared/pix3-status-bar';
import './shared/pix3-background';
import './welcome/pix3-welcome';
import './logs-view/logs-panel';
import './pix3-editor-shell.ts.css';

@customElement('pix3-editor')
export class Pix3EditorShell extends ComponentBase {
  @inject(LayoutManagerService)
  private readonly layoutManager!: LayoutManagerService;

  @inject(ProjectService)
  private readonly projectService!: ProjectService;

  @inject(OperationService)
  private readonly operationService!: OperationService;

  @inject(CommandDispatcher)
  private readonly commandDispatcher!: CommandDispatcher;

  @inject(CommandRegistry)
  private readonly commandRegistry!: CommandRegistry;

  @inject(EditorTabService)
  private readonly editorTabService!: EditorTabService;

  @inject(FileWatchService)
  private readonly fileWatchService!: FileWatchService;

  @inject(DialogService)
  private readonly dialogService!: DialogService;

  @inject(BehaviorPickerService)
  private readonly behaviorPickerService!: BehaviorPickerService;

  @inject(ScriptCreatorService)
  private readonly scriptCreatorService!: ScriptCreatorService;

  @inject(ScriptExecutionService)
  private readonly scriptExecutionService!: ScriptExecutionService;

  @inject(ProjectScriptLoaderService)
  private readonly _projectScriptLoader!: ProjectScriptLoaderService; // Injected to ensure service initialization

  @inject(ScriptCompilerService)
  private readonly _scriptCompiler!: ScriptCompilerService; // Injected to ensure service initialization

  // project open handled by <pix3-welcome>

  @state()
  private isLayoutReady = appState.ui.isLayoutReady;

  @state()
  private dialogs: DialogInstance[] = [];

  @state()
  private componentPickers: ComponentPickerInstance[] = [];

  @state()
  private scriptCreators: ScriptCreationInstance[] = [];

  @property({ type: Boolean, reflect: true, attribute: 'shell-ready' })
  protected shellReady = false;

  private disposeSubscription?: () => void;
  private disposeScenesSubscription?: () => void;
  private disposeDialogsSubscription?: () => void;
  private onWelcomeProjectReady?: (e: Event) => void;
  private keyboardHandler?: (e: KeyboardEvent) => void;
  private watchedSceneIds = new Set<string>();
  private watchedScenePaths = new Map<string, string>();
  private tabsInitialized = false;

  connectedCallback(): void {
    super.connectedCallback();

    // Register history commands and scene commands
    const saveCommand = new SaveSceneCommand();
    const saveAsCommand = new SaveAsSceneCommand();
    const deleteCommand = new DeleteObjectCommand();
    const undoCommand = new UndoCommand(this.operationService);
    const redoCommand = new RedoCommand(this.operationService);
    const playCommand = new PlaySceneCommand(this.scriptExecutionService);
    const stopCommand = new StopSceneCommand(this.scriptExecutionService);
    this.commandRegistry.registerMany(
      undoCommand,
      redoCommand,
      saveCommand,
      saveAsCommand,
      deleteCommand,
      playCommand,
      stopCommand
    );

    // Subscribe to dialog changes
    this.disposeDialogsSubscription = this.dialogService.subscribe(dialogs => {
      this.dialogs = dialogs;
      this.requestUpdate();
    });

    // Touch injected services to avoid unused var lint error (they are singletons for side-effects)
    void this._projectScriptLoader;
    void this._scriptCompiler;

    // Subscribe to component picker changes
    this.behaviorPickerService.subscribe(pickers => {
      this.componentPickers = pickers;
      this.requestUpdate();
    });

    // Subscribe to script creator changes
    this.scriptCreatorService.subscribe(creators => {
      this.scriptCreators = creators;
      this.requestUpdate();
    });

    // Setup keyboard shortcuts
    this.keyboardHandler = this.handleKeyboardShortcuts.bind(this);
    window.addEventListener('keydown', this.keyboardHandler);

    // Initialize tab service early to catch session persistence
    this.editorTabService.initialize();

    this.disposeSubscription = subscribe(appState.ui, () => {
      this.isLayoutReady = appState.ui.isLayoutReady;
      this.shellReady = this.isLayoutReady;
      this.requestUpdate();
    });
    // also subscribe to project state so we can initialize layout once a project is opened
    subscribe(appState.project, () => {
      // if project becomes ready and layout has not been initialized, initialize it
      if (appState.project.status === 'ready') {
        // ensure URL reflects editor state so HMR / page reload keeps us in the editor
        try {
          if (typeof window !== 'undefined' && window.location.hash !== '#editor') {
            // Use replaceState to avoid creating extra history entries during normal opens
            history.replaceState(null, '', '#editor');
          }
        } catch {
          // ignore
        }
        const host = this.renderRoot.querySelector<HTMLDivElement>('.layout-host');
        if (host && !this.shellReady) {
          void this.layoutManager.initialize(host).then(async () => {
            this.shellReady = true;
            this.requestUpdate();

            // Restore previously open tabs from session storage.
            if (!this.tabsInitialized) {
              this.tabsInitialized = true;
              
              if (appState.project.id) {
                await this.editorTabService.restoreProjectSession(appState.project.id);
              }
            }
          });
        }
      }
    });

    // Subscribe to scene descriptor changes to start/stop file watching
    this.disposeScenesSubscription = subscribe(appState.scenes, () => {
      this.updateSceneWatchers();

      // Notify script execution service of scene changes
      const activeSceneId = appState.scenes.activeSceneId;
      this.scriptExecutionService.onSceneChanged(activeSceneId);
    });

    // If the app was reloaded (HMR) and the URL indicates the editor, try to auto-open
    // the most recent project so the shell will initialize and avoid showing the welcome UI.
    try {
      if (typeof window !== 'undefined' && window.location.hash === '#editor') {
        // If a project is not already open, attempt to open the most recent one (best-effort).
        if (appState.project.status !== 'ready') {
          const recents = this.projectService.getRecentProjects();
          if (recents && recents.length > 0) {
            // Don't block the UI; attempt to open the most recent project in background.
            void this.projectService.openRecentProject(recents[0]).catch(() => {
              // If auto-open fails (permission denied or no handle), we'll keep showing welcome.
            });
          }
        }
      }
    } catch {
      // ignore environment where window/history isn't available
    }

    // Listen for the welcome component signaling that project is ready so
    // the shell can remove it from the DOM and proceed with layout initialization.
    this.onWelcomeProjectReady = () => {
      try {
        const welcome = this.renderRoot.querySelector('pix3-welcome');
        if (welcome && welcome.parentElement) {
          welcome.parentElement.removeChild(welcome);
        }
      } catch {
        // ignore
      }
    };
    this.addEventListener(
      'pix3-welcome:project-ready',
      this.onWelcomeProjectReady as EventListener
    );
  }

  disconnectedCallback(): void {
    this.disposeSubscription?.();
    this.disposeSubscription = undefined;
    this.disposeScenesSubscription?.();
    this.disposeScenesSubscription = undefined;
    this.disposeDialogsSubscription?.();
    this.disposeDialogsSubscription = undefined;
    if (this.onWelcomeProjectReady) {
      this.removeEventListener(
        'pix3-welcome:project-ready',
        this.onWelcomeProjectReady as EventListener
      );
      this.onWelcomeProjectReady = undefined;
    }
    if (this.keyboardHandler) {
      window.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = undefined;
    }
    // Stop all file watchers
    this.fileWatchService.unwatchAll();
    // Stop script execution service
    this.scriptExecutionService.stop();
    super.disconnectedCallback();
  }

  private handleKeyboardShortcuts(e: KeyboardEvent): void {
    // Check if target is an input element where we should not intercept
    const target = e.target as HTMLElement;
    const isInputElement =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.contentEditable === 'true';

    // Undo: Cmd+Z (Mac) or Ctrl+Z (Windows/Linux)
    if (
      (e.key === 'z' || e.key === 'Z') &&
      (e.metaKey || e.ctrlKey) &&
      !e.shiftKey &&
      !isInputElement
    ) {
      e.preventDefault();
      void this.executeUndoCommand();
      return;
    }

    // Redo: Shift+Cmd+Z (Mac) or Ctrl+Y (Windows/Linux)
    if (
      ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey) && e.shiftKey) ||
      ((e.key === 'y' || e.key === 'Y') && e.ctrlKey && !isInputElement)
    ) {
      e.preventDefault();
      void this.executeRedoCommand();
      return;
    }

    // Delete: Delete or Backspace key
    if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      !e.metaKey &&
      !e.ctrlKey &&
      !isInputElement
    ) {
      e.preventDefault();
      void this.executeDeleteCommand();
      return;
    }
  }

  private async executeUndoCommand(): Promise<void> {
    try {
      await this.operationService.undo();
    } catch (error) {
      console.error('[Pix3EditorShell] Failed to undo', error);
    }
  }

  private async executeRedoCommand(): Promise<void> {
    try {
      await this.operationService.redo();
    } catch (error) {
      console.error('[Pix3EditorShell] Failed to redo', error);
    }
  }

  private async executeDeleteCommand(): Promise<void> {
    try {
      const command = this.commandRegistry.getCommand('scene.delete-object');
      if (command) {
        await this.commandDispatcher.execute(command);
      }
    } catch (error) {
      console.error('[Pix3EditorShell] Failed to delete objects', error);
    }
  }

  private onDialogConfirmed(e: CustomEvent): void {
    const dialogId = e.detail.dialogId;
    this.dialogService.confirm(dialogId);
  }

  private onDialogCancelled(e: CustomEvent): void {
    const dialogId = e.detail.dialogId;
    this.dialogService.cancel(dialogId);
  }

  /**
   * Update file watchers based on currently loaded scenes.
   * Starts watching new scenes with file handles, stops watching removed scenes.
   */
  private updateSceneWatchers(): void {
    const currentSceneIds = new Set(Object.keys(appState.scenes.descriptors));

    // Stop watching scenes that are no longer loaded
    for (const sceneId of this.watchedSceneIds) {
      if (!currentSceneIds.has(sceneId)) {
        const descriptor = appState.scenes.descriptors[sceneId];
        if (descriptor?.filePath) {
          this.fileWatchService.unwatch(descriptor.filePath);
        }
        this.watchedSceneIds.delete(sceneId);
        this.watchedScenePaths.delete(sceneId);
      }
    }

    // Start watching new scenes that have file handles
    for (const sceneId of currentSceneIds) {
      const descriptor = appState.scenes.descriptors[sceneId];
      const currentPath = descriptor?.filePath ?? '';
      const previousPath = this.watchedScenePaths.get(sceneId) ?? '';

      // If a scene's path changed (e.g., Save As inside project), rewire watchers.
      if (previousPath && currentPath && previousPath !== currentPath) {
        this.fileWatchService.unwatch(previousPath);
        this.watchedSceneIds.delete(sceneId);
        this.watchedScenePaths.delete(sceneId);
      }

      if (!this.watchedSceneIds.has(sceneId)) {
        if (descriptor?.fileHandle && currentPath) {
          // Only watch res:// paths (project files)
          if (currentPath.startsWith('res://')) {
            this.fileWatchService.watch(
              currentPath,
              descriptor.fileHandle,
              descriptor.lastModifiedTime,
              () => this.handleFileChanged(sceneId, currentPath)
            );
            this.watchedSceneIds.add(sceneId);
            this.watchedScenePaths.set(sceneId, currentPath);
          }
        }
      }
    }
  }

  /**
   * Handle external file change detection - reload the scene.
   */
  private handleFileChanged(sceneId: string, filePath: string): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[Pix3EditorShell] External scene file change detected', {
        sceneId,
        filePath,
      });
    }

    // Execute reload command
    const reloadCommand = new ReloadSceneCommand({ sceneId, filePath });
    void this.commandDispatcher.execute(reloadCommand).catch(error => {
      console.error('[Pix3EditorShell] Failed to reload scene from external change:', error);
    });
  }

  protected async firstUpdated(): Promise<void> {
    const host = this.renderRoot.querySelector<HTMLDivElement>('.layout-host');
    if (!host) {
      return;
    }

    // Only initialize the Golden Layout if a project is already opened.
    if (appState.project.status === 'ready') {
      await this.layoutManager.initialize(host);
      this.shellReady = true;

      // Open startup scene when no tabs exist.
      if (!this.tabsInitialized) {
        this.tabsInitialized = true;
        if (appState.tabs.tabs.length === 0) {
          const pending = appState.scenes.pendingScenePaths[0];
          if (pending) {
            if (process.env.NODE_ENV === 'development') {
              console.debug('[Pix3Editor] Opening startup scene tab', { pending });
            }
            await this.editorTabService.openResourceTab('scene', pending);
          }
        }
      }
    }
  }

  protected render() {
    return html`
      <div class="editor-shell" data-ready=${this.shellReady ? 'true' : 'false'}>
        ${this.renderToolbar()}
        <div class="workspace" role="presentation">
          <div class="layout-host" role="application" aria-busy=${!this.isLayoutReady}></div>
          ${this.isLayoutReady ? html`` : html`<pix3-welcome></pix3-welcome>`}
        </div>
        <pix3-status-bar></pix3-status-bar>
        ${this.renderDialogHost()} ${this.renderPickerHost()} ${this.renderScriptCreatorHost()}
      </div>
    `;
  }

  private renderToolbar() {
    const isPlaying = appState.ui.isPlaying;
    return html`
      <pix3-toolbar aria-label="Editor toolbar">
        <div class="toolbar-start">
          <pix3-main-menu slot="actions"></pix3-main-menu>
        </div>
        <div class="toolbar-content">
          <div class="toolbar-group">
            <pix3-toolbar-button
              icon=${isPlaying ? 'square' : 'play'}
              label=${isPlaying ? 'Stop' : 'Play'}
              ?toggled=${isPlaying}
              @click=${() => this.togglePlayMode()}
              aria-label=${isPlaying ? 'Stop Scene' : 'Play Scene'}
            ></pix3-toolbar-button>
          </div>
          <span> Project: ${appState.project.projectName} </span>
        </div>
      </pix3-toolbar>
    `;
  }

  private togglePlayMode() {
    const commandId = appState.ui.isPlaying ? 'scene.stop' : 'scene.play';
    void this.commandDispatcher.executeById(commandId);
  }

  private renderPickerHost() {
    return html`
      <div
        class="picker-host"
        @component-selected=${(e: CustomEvent) => this.onComponentSelected(e)}
        @component-picker-cancelled=${(e: CustomEvent) => this.onComponentPickerCancelled(e)}
        @component-picker-create-new=${(e: CustomEvent) => this.onComponentPickerCreateNew(e)}
      >
        ${this.componentPickers.map(
          picker => html` <pix3-behavior-picker .pickerId=${picker.id}></pix3-behavior-picker> `
        )}
      </div>
    `;
  }

  private onComponentSelected(e: CustomEvent): void {
    const { pickerId, component } = e.detail;
    this.behaviorPickerService.select(pickerId, component);
  }

  private onComponentPickerCancelled(e: CustomEvent): void {
    const { pickerId } = e.detail;
    this.behaviorPickerService.cancel(pickerId);
  }

  private onComponentPickerCreateNew(e: CustomEvent): void {
    const { pickerId } = e.detail;
    // First cancel the picker
    this.behaviorPickerService.cancel(pickerId);
    // Then show the script creator - we'll handle the result in the inspector
    // This event will bubble up to the inspector which initiated the picker
    this.dispatchEvent(
      new CustomEvent('script-creator-requested', {
        detail: { pickerId },
        bubbles: true,
        composed: true,
      })
    );
  }

  private renderScriptCreatorHost() {
    return html`
      <div
        class="script-creator-host"
        @script-create-confirmed=${(e: CustomEvent) => this.onScriptCreateConfirmed(e)}
        @script-create-cancelled=${(e: CustomEvent) => this.onScriptCreateCancelled(e)}
      >
        ${this.scriptCreators.map(
          creator => html`
            <pix3-script-creator
              .dialogId=${creator.id}
              .defaultName=${creator.params.defaultName || creator.params.scriptName}
            ></pix3-script-creator>
          `
        )}
      </div>
    `;
  }

  private onScriptCreateConfirmed(e: CustomEvent): void {
    const { dialogId, scriptName } = e.detail;
    void this.scriptCreatorService.confirm(dialogId, scriptName);
  }

  private onScriptCreateCancelled(e: CustomEvent): void {
    const { dialogId } = e.detail;
    this.scriptCreatorService.cancel(dialogId);
  }

  private renderDialogHost() {
    return html`
      <div
        class="dialog-host"
        @dialog-confirmed=${(e: CustomEvent) => this.onDialogConfirmed(e)}
        @dialog-cancelled=${(e: CustomEvent) => this.onDialogCancelled(e)}
        @dialog-secondary=${(e: CustomEvent) => this.onDialogSecondary(e)}
      >
        ${this.dialogs.map(
          dialog => html`
            <pix3-confirm-dialog
              .dialogId=${dialog.id}
              .title=${dialog.options.title}
              .message=${dialog.options.message}
              .confirmLabel=${dialog.options.confirmLabel || 'Confirm'}
              .secondaryLabel=${dialog.options.secondaryLabel || ''}
              .cancelLabel=${dialog.options.cancelLabel || 'Cancel'}
              .isDangerous=${dialog.options.isDangerous || false}
              .secondaryIsDangerous=${dialog.options.secondaryIsDangerous || false}
            ></pix3-confirm-dialog>
          `
        )}
      </div>
    `;
  }

  private onDialogSecondary(e: CustomEvent): void {
    const { dialogId } = e.detail;
    this.dialogService.secondary(dialogId);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-editor': Pix3EditorShell;
  }
}
