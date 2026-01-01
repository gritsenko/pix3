import { ComponentBase, customElement, html, inject, state } from '@/fw';
import { LoggingService } from '@/services/LoggingService';
import { subscribe } from 'valtio/vanilla';
import { appState } from '@/state';
import './pix3-status-bar.ts.css';

interface StatusMessage {
  text: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
}

@customElement('pix3-status-bar')
export class Pix3StatusBar extends ComponentBase {
  static useShadowDom = false;

  @inject(LoggingService)
  private readonly logger!: LoggingService;

  @state()
  private currentMessage: StatusMessage | null = null;

  @state()
  private projectName: string | null = null;

  @state()
  private isPlaying = false;

  private messageTimeout: number | null = null;
  private disposeLogListener?: () => void;
  private disposeStateSubscription?: () => void;

  connectedCallback() {
    super.connectedCallback();

    // Subscribe to project name changes
    this.disposeStateSubscription = subscribe(appState.project, () => {
      this.projectName = appState.project.projectName;
      this.isPlaying = appState.ui.isPlaying;
    });

    // Subscribe to log messages to show status
    this.disposeLogListener = this.logger.subscribe(entry => {
      // Show important messages in status bar
      if (entry.level === 'error' || entry.level === 'warn' || entry.level === 'info') {
        this.showMessage(
          entry.message,
          entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warning' : 'info'
        );
      }
    });

    // Initialize state
    this.projectName = appState.project.projectName;
    this.isPlaying = appState.ui.isPlaying;
  }

  disconnectedCallback() {
    this.disposeLogListener?.();
    this.disposeStateSubscription?.();
    if (this.messageTimeout !== null) {
      window.clearTimeout(this.messageTimeout);
    }
    super.disconnectedCallback();
  }

  /**
   * Show a temporary status message
   */
  showMessage(text: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    this.currentMessage = {
      text,
      type,
      timestamp: Date.now(),
    };

    // Clear previous timeout
    if (this.messageTimeout !== null) {
      window.clearTimeout(this.messageTimeout);
    }

    // Auto-hide after 5 seconds
    this.messageTimeout = window.setTimeout(() => {
      this.currentMessage = null;
      this.messageTimeout = null;
    }, 5000);
  }

  protected render() {
    return html`
      <div class="status-bar">
        <div class="status-left">
          ${this.currentMessage
            ? html`
                <span class="status-message ${this.currentMessage.type}">
                  ${this.currentMessage.text}
                </span>
              `
            : html`<span class="status-ready">Ready</span>`}
        </div>
        <div class="status-right">
          ${this.isPlaying
            ? html`<span class="status-indicator playing">▶ Playing</span>`
            : html``}
          ${this.projectName
            ? html`<span class="status-project">${this.projectName}</span>`
            : html``}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-status-bar': Pix3StatusBar;
  }
}
