/**
 * Custom Property Editor Components
 *
 * Specialized editors for vector and rotation properties that display
 * multiple components (x, y, z) in a single row.
 */

import { html, css, customElement, property, state } from '@/fw';
import { ComponentBase } from '@/fw/component-base';

export interface Vector2Value {
  x: number;
  y: number;
}

export interface Vector3Value {
  x: number;
  y: number;
  z: number;
}

/**
 * Vector2 Editor - Displays x, y fields in one row
 */
@customElement('pix3-vector2-editor')
export class Vector2Editor extends ComponentBase {
  protected static useShadowDom = true;
  @property({ type: Number })
  x: number = 0;

  @property({ type: Number })
  y: number = 0;

  @property({ type: Number })
  step: number = 0.01;

  @property({ type: Number })
  precision: number = 2;

  static styles = css`
    :host {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .vector-input-group {
      display: flex;
      gap: 0.25rem;
      flex: 1;
    }

    .vector-input {
      flex: 1;
      min-width: 3rem;
    }

    input {
      background: var(--color-input-bg, #222);
      color: var(--color-text-primary, #eee);
      border: 1px solid var(--color-border, #333);
      border-radius: 0.25rem;
      padding: 0.25rem 0.5rem;
      font-size: 0.8rem;
      box-sizing: border-box;
      width: 100%;
    }

    input:focus {
      outline: none;
      border-color: var(--color-accent, #4e8df5);
    }

    input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .axis-label {
      font-size: 0.75rem;
      color: var(--color-text-subtle, #888);
      min-width: 1rem;
      text-align: center;
      font-weight: 600;
    }
  `;

  protected render() {
    return html`
      <div class="vector-input-group">
        <div class="axis-label">X</div>
        <input
          type="number"
          class="vector-input"
          step=${this.step}
          .value=${this.x.toFixed(this.precision)}
          @input=${(e: Event) =>
            this.dispatchEvent(
              new CustomEvent('change', {
                detail: { x: parseFloat((e.target as HTMLInputElement).value), y: this.y },
              })
            )}
        />

        <div class="axis-label">Y</div>
        <input
          type="number"
          class="vector-input"
          step=${this.step}
          .value=${this.y.toFixed(this.precision)}
          @input=${(e: Event) =>
            this.dispatchEvent(
              new CustomEvent('change', {
                detail: { x: this.x, y: parseFloat((e.target as HTMLInputElement).value) },
              })
            )}
        />
      </div>
    `;
  }
}

/**
 * Vector3 Editor - Displays x, y, z fields in one row
 */
@customElement('pix3-vector3-editor')
export class Vector3Editor extends ComponentBase {
  protected static useShadowDom = true;
  @property({ type: Number })
  x: number = 0;

  @property({ type: Number })
  y: number = 0;

  @property({ type: Number })
  z: number = 0;

  @property({ type: Number })
  step: number = 0.01;

  @property({ type: Number })
  precision: number = 2;

  static styles = css`
    :host {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .vector-input-group {
      display: flex;
      gap: 0.25rem;
      flex: 1;
    }

    .vector-input {
      flex: 1;
      min-width: 3rem;
    }

    input {
      background: var(--color-input-bg, #222);
      color: var(--color-text-primary, #eee);
      border: 1px solid var(--color-border, #333);
      border-radius: 0.25rem;
      padding: 0.25rem 0.5rem;
      font-size: 0.8rem;
      box-sizing: border-box;
      width: 100%;
    }

    input:focus {
      outline: none;
      border-color: var(--color-accent, #4e8df5);
    }

    input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .axis-label {
      font-size: 0.75rem;
      color: var(--color-text-subtle, #888);
      min-width: 1rem;
      text-align: center;
      font-weight: 600;
    }
  `;

  protected render() {
    return html`
      <div class="vector-input-group">
        <div class="axis-label">X</div>
        <input
          type="number"
          class="vector-input"
          step=${this.step}
          .value=${this.x.toFixed(this.precision)}
          @input=${(e: Event) =>
            this.dispatchEvent(
              new CustomEvent('change', {
                detail: {
                  x: parseFloat((e.target as HTMLInputElement).value),
                  y: this.y,
                  z: this.z,
                },
              })
            )}
        />

        <div class="axis-label">Y</div>
        <input
          type="number"
          class="vector-input"
          step=${this.step}
          .value=${this.y.toFixed(this.precision)}
          @input=${(e: Event) =>
            this.dispatchEvent(
              new CustomEvent('change', {
                detail: {
                  x: this.x,
                  y: parseFloat((e.target as HTMLInputElement).value),
                  z: this.z,
                },
              })
            )}
        />

        <div class="axis-label">Z</div>
        <input
          type="number"
          class="vector-input"
          step=${this.step}
          .value=${this.z.toFixed(this.precision)}
          @input=${(e: Event) =>
            this.dispatchEvent(
              new CustomEvent('change', {
                detail: {
                  x: this.x,
                  y: this.y,
                  z: parseFloat((e.target as HTMLInputElement).value),
                },
              })
            )}
        />
      </div>
    `;
  }
}

/**
 * Euler Rotation Editor - Displays pitch, yaw, roll (x, y, z) in degrees
 */
@customElement('pix3-euler-editor')
export class EulerEditor extends ComponentBase {
  protected static useShadowDom = true;
  @property({ type: Number })
  x: number = 0; // pitch

  @property({ type: Number })
  y: number = 0; // yaw

  @property({ type: Number })
  z: number = 0; // roll

  @property({ type: Number })
  step: number = 0.1;

  @property({ type: Number })
  precision: number = 1;

  static styles = css`
    :host {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .euler-input-group {
      display: flex;
      gap: 0.25rem;
      flex: 1;
    }

    .euler-input {
      flex: 1;
      min-width: 3rem;
    }

    input {
      background: var(--color-input-bg, #222);
      color: var(--color-text-primary, #eee);
      border: 1px solid var(--color-border, #333);
      border-radius: 0.25rem;
      padding: 0.25rem 0.5rem;
      font-size: 0.8rem;
      box-sizing: border-box;
      width: 100%;
    }

    input:focus {
      outline: none;
      border-color: var(--color-accent, #4e8df5);
    }

    input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .axis-label {
      font-size: 0.75rem;
      color: var(--color-text-subtle, #888);
      min-width: 1rem;
      text-align: center;
      font-weight: 600;
    }

    .unit-label {
      font-size: 0.7rem;
      color: var(--color-text-subtle, #888);
      margin-left: 0.25rem;
    }
  `;

  protected render() {
    return html`
      <div class="euler-input-group">
        <div class="axis-label">X</div>
        <input
          type="number"
          class="euler-input"
          step=${this.step}
          .value=${this.x.toFixed(this.precision)}
          @input=${(e: Event) =>
            this.dispatchEvent(
              new CustomEvent('change', {
                detail: {
                  x: parseFloat((e.target as HTMLInputElement).value),
                  y: this.y,
                  z: this.z,
                },
              })
            )}
        />

        <div class="axis-label">Y</div>
        <input
          type="number"
          class="euler-input"
          step=${this.step}
          .value=${this.y.toFixed(this.precision)}
          @input=${(e: Event) =>
            this.dispatchEvent(
              new CustomEvent('change', {
                detail: {
                  x: this.x,
                  y: parseFloat((e.target as HTMLInputElement).value),
                  z: this.z,
                },
              })
            )}
        />

        <div class="axis-label">Z</div>
        <input
          type="number"
          class="euler-input"
          step=${this.step}
          .value=${this.z.toFixed(this.precision)}
          @input=${(e: Event) =>
            this.dispatchEvent(
              new CustomEvent('change', {
                detail: {
                  x: this.x,
                  y: this.y,
                  z: parseFloat((e.target as HTMLInputElement).value),
                },
              })
            )}
        />
        <span class="unit-label">°</span>
      </div>
    `;
  }
}

@customElement('pix3-texture-resource-editor')
export class TextureResourceEditor extends ComponentBase {
  protected static useShadowDom = true;
  @property({ type: String })
  resourceUrl: string = '';

  @property({ type: String })
  previewUrl: string = '';

  @property({ type: Boolean })
  disabled: boolean = false;

  @state()
  private isDragOver = false;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      width: 100%;
    }

    .preview {
      position: relative;
      border: 1px dashed var(--color-border, #333);
      border-radius: 0.375rem;
      width: 64px;
      height: 64px;
      background: var(--color-input-bg, #222);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      transition: border-color 0.15s ease, background 0.15s ease;
    }

    .preview.is-dragover {
      border-color: var(--pix3-accent-color, #ffcf33);
      background: rgba(var(--pix3-accent-rgb, 255, 207, 51), 0.08);
    }

    .preview img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }

    .preview-empty {
      color: var(--color-text-subtle, #888);
      font-size: 0.75rem;
      text-align: center;
      padding: 0.5rem;
    }

    .url-row {
      display: flex;
      gap: 0.4rem;
      align-items: center;
    }

    input {
      flex: 1;
      min-width: 0;
      background: var(--color-input-bg, #222);
      color: var(--color-text-primary, #eee);
      border: 1px solid var(--color-border, #333);
      border-radius: 0.25rem;
      padding: 0.25rem 0.5rem;
      font-size: 0.8rem;
      box-sizing: border-box;
    }

    input:focus {
      outline: none;
      border-color: var(--color-accent, #4e8df5);
    }

    button {
      border: 1px solid var(--color-border, #333);
      background: transparent;
      color: var(--color-text-secondary, #aaa);
      border-radius: 0.25rem;
      padding: 0.2rem 0.5rem;
      font-size: 0.75rem;
      cursor: pointer;
      white-space: nowrap;
    }

    button:hover:not(:disabled) {
      border-color: var(--pix3-accent-color, #ffcf33);
      color: var(--color-text-primary, #eee);
    }

    button:disabled,
    input:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `;

  private emitChange(url: string): void {
    this.dispatchEvent(
      new CustomEvent('change', {
        detail: { url },
        bubbles: true,
        composed: true,
      })
    );
  }

  private onDragOver(event: DragEvent): void {
    if (this.disabled) {
      return;
    }
    event.preventDefault();
    this.isDragOver = true;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  private onDragLeave(): void {
    this.isDragOver = false;
  }

  private onDrop(event: DragEvent): void {
    if (this.disabled) {
      return;
    }
    event.preventDefault();
    this.isDragOver = false;

    this.dispatchEvent(
      new CustomEvent('texture-drop', {
        detail: { event },
        bubbles: true,
        composed: true,
      })
    );
  }

  protected render() {
    return html`
      <div
        class="preview ${this.isDragOver ? 'is-dragover' : ''}"
        @dragover=${(event: DragEvent) => this.onDragOver(event)}
        @dragleave=${() => this.onDragLeave()}
        @drop=${(event: DragEvent) => this.onDrop(event)}
      >
        ${this.previewUrl
          ? html`<img src=${this.previewUrl} alt="Texture preview" />`
          : html`<span class="preview-empty">Drop image from Assets here</span>`}
      </div>

      <div class="url-row">
        <input
          type="text"
          .value=${this.resourceUrl}
          ?disabled=${this.disabled}
          placeholder="res://path/to/texture.png"
          @change=${(e: Event) => this.emitChange((e.target as HTMLInputElement).value)}
        />
        <button type="button" ?disabled=${this.disabled} @click=${() => this.emitChange('')}>
          Clear
        </button>
      </div>
    `;
  }
}

export interface SizeValue {
  width: number;
  height: number;
  aspectRatioLocked?: boolean;
  hasOriginalSize?: boolean;
}

/**
 * Size Editor - Displays width and height fields with aspect ratio lock and reset button
 */
@customElement('pix3-size-editor')
export class SizeEditor extends ComponentBase {
  protected static useShadowDom = true;
  @property({ type: Number })
  width: number = 64;

  @property({ type: Number })
  height: number = 64;

  @property({ type: Boolean })
  aspectRatioLocked: boolean = false;

  @property({ type: Boolean })
  hasOriginalSize: boolean = false;

  @property({ type: Number })
  originalWidth: number | null = null;

  @property({ type: Number })
  originalHeight: number | null = null;

  @property({ type: Boolean })
  disabled: boolean = false;

  @state()
  private localAspectRatio: number = 1;

  updated(changedProperties: Map<string, any>): void {
    if (changedProperties.has('width') || changedProperties.has('height')) {
      if (this.height > 0) {
        this.localAspectRatio = this.width / this.height;
      }
    }
  }

  private emitChange(width: number, height: number): void {
    this.dispatchEvent(
      new CustomEvent('change', {
        detail: { width, height, aspectRatioLocked: this.aspectRatioLocked },
        bubbles: true,
        composed: true,
      })
    );
  }

  private onWidthChange(e: Event): void {
    const newWidth = parseFloat((e.target as HTMLInputElement).value);
    if (!Number.isFinite(newWidth) || newWidth <= 0) return;

    let newHeight = this.height;
    if (this.aspectRatioLocked && this.localAspectRatio > 0) {
      newHeight = newWidth / this.localAspectRatio;
    }

    this.emitChange(newWidth, newHeight);
  }

  private onHeightChange(e: Event): void {
    const newHeight = parseFloat((e.target as HTMLInputElement).value);
    if (!Number.isFinite(newHeight) || newHeight <= 0) return;

    let newWidth = this.width;
    if (this.aspectRatioLocked && this.localAspectRatio > 0) {
      newWidth = newHeight * this.localAspectRatio;
    }

    this.emitChange(newWidth, newHeight);
  }

  private onToggleLock(): void {
    this.aspectRatioLocked = !this.aspectRatioLocked;
    this.emitChange(this.width, this.height);
  }

  private onResetSize(): void {
    if (this.originalWidth && this.originalHeight) {
      this.dispatchEvent(
        new CustomEvent('reset-size', {
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      width: 100%;
    }

    .size-fields {
      display: flex;
      gap: 0.5rem;
      align-items: flex-end;
    }

    .field-group {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .field-label {
      font-size: 0.75rem;
      color: var(--color-text-subtle, #888);
      font-weight: 500;
    }

    .field-input-row {
      display: flex;
      gap: 0.25rem;
      align-items: center;
    }

    input[type='number'] {
      flex: 1;
      background: var(--color-input-bg, #222);
      color: var(--color-text-primary, #eee);
      border: 1px solid var(--color-border, #333);
      border-radius: 0.25rem;
      padding: 0.25rem 0.5rem;
      font-size: 0.8rem;
      box-sizing: border-box;
      min-width: 0;
    }

    input[type='number']:focus {
      outline: none;
      border-color: var(--color-accent, #4e8df5);
    }

    input[type='number']:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    button {
      background: transparent;
      border: 1px solid var(--color-border, #333);
      color: var(--color-text-secondary, #aaa);
      border-radius: 0.25rem;
      padding: 0.2rem 0.4rem;
      font-size: 0.7rem;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
    }

    button:hover:not(:disabled) {
      border-color: var(--pix3-accent-color, #ffcf33);
      color: var(--color-text-primary, #eee);
    }

    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .controls {
      display: flex;
      gap: 0.4rem;
      align-items: center;
    }

    .lock-toggle {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    input[type='checkbox'] {
      cursor: pointer;
      width: 1rem;
      height: 1rem;
      accent-color: var(--pix3-accent-color, #ffcf33);
    }

    input[type='checkbox']:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    .lock-label {
      font-size: 0.7rem;
      color: var(--color-text-secondary, #aaa);
      user-select: none;
    }
  `;

  protected render() {
    return html`
      <div class="size-fields">
        <div class="field-group">
          <label class="field-label">Width</label>
          <input
            type="number"
            ?disabled=${this.disabled}
            .value=${this.width.toString()}
            step="1"
            min="1"
            @input=${(e: Event) => this.onWidthChange(e)}
          />
        </div>

        <div class="field-group">
          <label class="field-label">Height</label>
          <input
            type="number"
            ?disabled=${this.disabled}
            .value=${this.height.toString()}
            step="1"
            min="1"
            @input=${(e: Event) => this.onHeightChange(e)}
          />
        </div>

        <div class="controls">
          <div class="lock-toggle">
            <input
              type="checkbox"
              ?checked=${this.aspectRatioLocked}
              ?disabled=${this.disabled}
              @change=${() => this.onToggleLock()}
            />
            <label class="lock-label" title="Lock aspect ratio when resizing">🔗</label>
          </div>

          <button
            type="button"
            ?disabled=${this.disabled || !this.hasOriginalSize}
            @click=${() => this.onResetSize()}
            title="Reset to original size"
          >
            Reset
          </button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pix3-vector2-editor': Vector2Editor;
    'pix3-vector3-editor': Vector3Editor;
    'pix3-euler-editor': EulerEditor;
    'pix3-texture-resource-editor': TextureResourceEditor;
    'pix3-size-editor': SizeEditor;
  }
}
