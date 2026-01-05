import { ComponentBase, customElement, html, inject, state, css, unsafeCSS } from '@/fw';
import { LoggingService, type LogLevel, type LogEntry } from '@/services/LoggingService';
import { IconService, IconSize } from '@/services/IconService';
import styles from './logs-panel.ts.css?raw';

@customElement('pix3-logs-panel')
export class LogsPanel extends ComponentBase {
  static useShadowDom = true;

  static styles = css`
    ${unsafeCSS(styles)}
  `;

  @inject(LoggingService)
  private readonly loggingService!: LoggingService;

  @inject(IconService)
  private readonly iconService!: IconService;

  @state()
  private logs: LogEntry[] = [];

  @state()
  private enabledLevels: Set<LogLevel> = new Set(['info', 'warn', 'error']);

  @state()
  private expandedLogs: Set<string> = new Set();

  private disposeListen?: () => void;
  private contentElement?: HTMLElement;

  connectedCallback() {
    super.connectedCallback();

    // Get initial logs
    this.logs = this.loggingService.getLogs();
    this.enabledLevels = new Set(this.loggingService.getEnabledLevels());

    // Subscribe to new logs
    this.disposeListen = this.loggingService.subscribe(() => {
      this.logs = [...this.loggingService.getLogs()];
      this.requestUpdate();
      // Scroll to bottom when new log arrives
      this.scrollToBottom();
    });
  }

  disconnectedCallback() {
    this.disposeListen?.();
    this.disposeListen = undefined;
    super.disconnectedCallback();
  }

  protected updated() {
    // Scroll to bottom after render
    this.scrollToBottom();
  }

  private scrollToBottom() {
    if (!this.contentElement) {
      this.contentElement = this.renderRoot.querySelector('.logs-content') || undefined;
    }
    if (this.contentElement) {
      this.contentElement.scrollTop = this.contentElement.scrollHeight;
    }
  }

  private handleLevelToggle(level: LogLevel) {
    this.loggingService.toggleLevel(level);
    this.enabledLevels = new Set(this.loggingService.getEnabledLevels());
    this.requestUpdate();
  }

  private handleClear() {
    this.loggingService.clearLogs();
    this.logs = [];
    this.expandedLogs = new Set();
    this.requestUpdate();
  }

  private toggleLogExpansion(id: string) {
    const newExpanded = new Set(this.expandedLogs);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    this.expandedLogs = newExpanded;
  }

  private formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  }

  private formatErrorDetails(data: unknown): string {
    if (!data) {
      return '';
    }

    if (typeof data !== 'object') {
      return String(data);
    }

    const errorData = data as Record<string, unknown>;
    const parts: string[] = [];

    if (errorData.file) {
      parts.push(`File: ${String(errorData.file)}`);
    }
    if (errorData.line !== undefined) {
      parts.push(`Line: ${String(errorData.line)}`);
    }
    if (errorData.column !== undefined) {
      parts.push(`Column: ${String(errorData.column)}`);
    }

    if (errorData.details && typeof errorData.details === 'object') {
      const details = errorData.details as Record<string, unknown>;
      if (details.message) {
        parts.push(`Message: ${String(details.message)}`);
      }
      if (details.text) {
        parts.push(`Error: ${String(details.text)}`);
      }
      if (details.stack) {
        parts.push(`Stack: ${String(details.stack)}`);
      }
    } else if (errorData.message && typeof errorData.message === 'string') {
      parts.push(`Message: ${errorData.message}`);
    } else if (errorData.stack && typeof errorData.stack === 'string') {
      parts.push(`Stack: ${errorData.stack}`);
    }

    if (parts.length === 0) {
      try {
        return JSON.stringify(data, null, 2);
      } catch {
        return String(data);
      }
    }

    return parts.join('\n');
  }

  private renderLevelToggle(level: LogLevel) {
    const isEnabled = this.enabledLevels.has(level);
    return html`
      <div class="level-toggle ${level}">
        <input
          type="checkbox"
          id="level-${level}"
          .checked=${isEnabled}
          @change=${() => {
            this.handleLevelToggle(level);
          }}
          aria-label="Toggle ${level} logs"
        />
        <label for="level-${level}">${level.toUpperCase()}</label>
      </div>
    `;
  }

  protected render() {
    const visibleLogs = this.logs.filter(log => this.enabledLevels.has(log.level));

    return html`
      <div class="logs-container">
        <div class="logs-header">
          <div class="logs-controls">
            ${this.renderLevelToggle('debug')} ${this.renderLevelToggle('info')}
            ${this.renderLevelToggle('warn')} ${this.renderLevelToggle('error')}
          </div>
          <button class="clear-btn" @click=${() => this.handleClear()} aria-label="Clear all logs">
            Clear
          </button>
        </div>
        <div class="logs-content">
          ${visibleLogs.length === 0
            ? html`<div class="logs-empty">No logs to display</div>`
            : html`
                <ul class="logs-list">
                  ${visibleLogs.map(log => {
                    const isExpanded = this.expandedLogs.has(log.id);
                    const hasDetails = !!log.data;
                    return html`
                      <li
                        class="log-entry ${log.level} ${hasDetails ? 'expandable' : ''} ${isExpanded
                          ? 'expanded'
                          : ''}"
                        @click=${hasDetails ? () => this.toggleLogExpansion(log.id) : undefined}
                      >
                        <div class="log-main">
                          <span class="log-chevron">
                            ${hasDetails
                              ? this.iconService.getIcon(
                                  isExpanded ? 'chevron-down' : 'chevron-right',
                                  IconSize.SMALL
                                )
                              : ''}
                          </span>
                          <span class="log-level">${log.level.toUpperCase()}</span>
                          <span class="log-message">${log.message}</span>
                          <span class="log-timestamp">${this.formatTime(log.timestamp)}</span>
                        </div>
                        ${hasDetails && isExpanded
                          ? html`<pre class="log-details">
${this.formatErrorDetails(log.data)}</pre
                            >`
                          : ''}
                      </li>
                    `;
                  })}
                </ul>
              `}
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-logs-panel': LogsPanel;
  }
}
