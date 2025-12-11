import { subscribe } from 'valtio/vanilla';

import { ComponentBase, customElement, html, inject, property, state } from '@/fw';
import { LayoutManagerService } from '@/core/LayoutManager';
import { OperationService } from '@/services/OperationService';
import { CommandDispatcher } from '@/services/CommandDispatcher';
import { CommandRegistry } from '@/services/CommandRegistry';
import { FileWatchService } from '@/services/FileWatchService';
import { DialogService, type DialogInstance } from '@/services/DialogService';
import { LoadSceneCommand } from '@/features/scene/LoadSceneCommand';
import { SaveAsSceneCommand } from '@/features/scene/SaveAsSceneCommand';
import { ReloadSceneCommand } from '@/features/scene/ReloadSceneCommand';
import { UndoCommand } from '@/features/history/UndoCommand';
import { RedoCommand } from '@/features/history/RedoCommand';
import { appState } from '@/state';
import { ProjectService } from '@/services';
import './shared/pix3-toolbar';
import './shared/pix3-toolbar-button';
import './shared/pix3-main-menu';
import './shared/pix3-confirm-dialog';
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

  @inject(FileWatchService)
  private readonly fileWatchService!: FileWatchService;

  @inject(DialogService)
  private readonly dialogService!: DialogService;

  // project open handled by <pix3-welcome>

  @state()
  private isLayoutReady = appState.ui.isLayoutReady;

  @state()
  private dialogs: DialogInstance[] = [];

  @property({ type: Boolean, reflect: true, attribute: 'shell-ready' })
  protected shellReady = false;

  private disposeSubscription?: () => void;
  private disposeScenesSubscription?: () => void;
  private disposeDialogsSubscription?: () => void;
  private onWelcomeProjectReady?: (e: Event) => void;
  private keyboardHandler?: (e: KeyboardEvent) => void;
  private watchedSceneIds = new Set<string>();

  connectedCallback(): void {
    super.connectedCallback();

    // Register history commands and scene commands
    const saveAsCommand = new SaveAsSceneCommand();
    const undoCommand = new UndoCommand(this.operationService);
    const redoCommand = new RedoCommand(this.operationService);
    this.commandRegistry.registerMany(undoCommand, redoCommand, saveAsCommand);

    // Subscribe to dialog changes
    this.disposeDialogsSubscription = this.dialogService.subscribe(dialogs => {
      this.dialogs = dialogs;
      this.requestUpdate();
    });

    // Setup keyboard shortcuts
    this.keyboardHandler = this.handleKeyboardShortcuts.bind(this);
    window.addEventListener('keydown', this.keyboardHandler);
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
          void this.layoutManager.initialize(host).then(() => {
            this.shellReady = true;
            this.requestUpdate();
          });
        }

        // Load pending startup scene once project is ready
        const pending = appState.scenes.pendingScenePaths[0];
        if (pending) {
          if (process.env.NODE_ENV === 'development') {
            console.debug('[Pix3Editor] Loading startup scene', { pending });
          }
          const command = new LoadSceneCommand({ filePath: pending });
          void this.commandDispatcher.execute(command);
        }
      }
    });

    // Subscribe to scene descriptor changes to start/stop file watching
    this.disposeScenesSubscription = subscribe(appState.scenes, () => {
      this.updateSceneWatchers();
      this.updateViewportTitle();
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

  private onDialogConfirmed(e: CustomEvent): void {
    const { dialogId } = e.detail;
    if (dialogId) {
      this.dialogService.confirm(dialogId);
    }
  }

  private onDialogCancelled(e: CustomEvent): void {
    const { dialogId } = e.detail;
    if (dialogId) {
      this.dialogService.cancel(dialogId);
    }
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
      }
    }

    // Start watching new scenes that have file handles
    for (const sceneId of currentSceneIds) {
      if (!this.watchedSceneIds.has(sceneId)) {
        const descriptor = appState.scenes.descriptors[sceneId];
        if (descriptor?.fileHandle && descriptor?.filePath) {
          // Only watch res:// paths (project files)
          if (descriptor.filePath.startsWith('res://')) {
            this.fileWatchService.watch(
              descriptor.filePath,
              descriptor.fileHandle,
              descriptor.lastModifiedTime,
              () => this.handleFileChanged(sceneId, descriptor.filePath)
            );
            this.watchedSceneIds.add(sceneId);
          }
        }
      }
    }
  }

  /**
   * Update viewport tab title based on active scene name and file name.
   */
  private updateViewportTitle(): void {
    const activeSceneId = appState.scenes.activeSceneId;
    if (!activeSceneId) {
      this.layoutManager.setViewportTitle('Viewport');
      return;
    }

    const descriptor = appState.scenes.descriptors[activeSceneId];
    if (!descriptor) {
      this.layoutManager.setViewportTitle('Viewport');
      return;
    }

    // Extract file name from path (e.g., "res://scenes/level-1.pix3scene" -> "level-1.pix3scene")
    const normalizedPath = descriptor.filePath.replace(/\\/g, '/');
    const segments = normalizedPath.split('/').filter(Boolean);
    const fileName = segments.length ? segments[segments.length - 1] : descriptor.filePath;

    // Use file name as viewport title (e.g., "level-1.pix3scene")
    this.layoutManager.setViewportTitle(fileName);
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

      // Load pending startup scene if project is already ready
      const pending = appState.scenes.pendingScenePaths[0];
      if (pending) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[Pix3Editor] Loading startup scene', { pending });
        }
        const command = new LoadSceneCommand({ filePath: pending });
        await this.commandDispatcher.execute(command);
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
        ${this.renderDialogHost()}
      </div>
    `;
  }

  private renderToolbar() {
    return html`
      <pix3-toolbar aria-label="Editor toolbar">
        <div class="toolbar-start">
          <pix3-main-menu slot="actions"></pix3-main-menu>
        </div>
        <div class="toolbar-content">
          <span> Project: ${appState.project.projectName} </span>
        </div>
      </pix3-toolbar>
    `;
  }

  private renderDialogHost() {
    return html`
      <div
        class="dialog-host"
        @dialog-confirmed=${(e: CustomEvent) => this.onDialogConfirmed(e)}
        @dialog-cancelled=${(e: CustomEvent) => this.onDialogCancelled(e)}
      >
        ${this.dialogs.map(
          dialog => html`
            <pix3-confirm-dialog
              .dialogId=${dialog.id}
              .title=${dialog.options.title}
              .message=${dialog.options.message}
              .confirmLabel=${dialog.options.confirmLabel || 'Confirm'}
              .cancelLabel=${dialog.options.cancelLabel || 'Cancel'}
              .isDangerous=${dialog.options.isDangerous || false}
            ></pix3-confirm-dialog>
          `
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-editor': Pix3EditorShell;
  }
}
