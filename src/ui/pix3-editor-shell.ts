import { subscribe } from 'valtio/vanilla';

import { ComponentBase, customElement, html, inject, property, state } from '@/fw';
import { LayoutManagerService } from '@/core/LayoutManager';
import { OperationService } from '@/services/OperationService';
import { CommandDispatcher } from '@/services/CommandDispatcher';
import { LoadSceneCommand } from '@/features/scene/LoadSceneCommand';
import { appState } from '@/state';
import { ProjectService } from '@/services';
import './shared/pix3-toolbar';
import './shared/pix3-toolbar-button';
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

  // project open handled by <pix3-welcome>

  @state()
  private isLayoutReady = appState.ui.isLayoutReady;

  @property({ type: Boolean, reflect: true, attribute: 'shell-ready' })
  protected shellReady = false;

  private disposeSubscription?: () => void;
  private onWelcomeProjectReady?: (e: Event) => void;
  private keyboardHandler?: (e: KeyboardEvent) => void;

  connectedCallback(): void {
    super.connectedCallback();

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
      </div>
    `;
  }

  private renderToolbar() {
    return html`
      <pix3-toolbar aria-label="Editor toolbar">
        <div class="toolbar-start">
        <span slot="actions" class="product-title" role="heading" aria-level="1"> 
          Pix3 
        </span>
        </div>
        <div class="toolbar-content">
          <span > Project: ${appState.project.projectName} </span>
        </div>
      </pix3-toolbar>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-editor': Pix3EditorShell;
  }
}
