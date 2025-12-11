/**
 * Custom Property Editor Components
 *
 * Specialized editors for vector and rotation properties that display
 * multiple components (x, y, z) in a single row.
 */

import { html, css, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

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
export class Vector2Editor extends LitElement {
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
export class Vector3Editor extends LitElement {
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
export class EulerEditor extends LitElement {
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

declare global {
  interface HTMLElementTagNameMap {
    'pix3-vector2-editor': Vector2Editor;
    'pix3-vector3-editor': Vector3Editor;
    'pix3-euler-editor': EulerEditor;
  }
}
