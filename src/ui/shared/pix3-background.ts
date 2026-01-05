import { ComponentBase, customElement, html } from '@/fw';
import './pix3-background.ts.css';

@customElement('pix3-background')
export class BackgroundComponent extends ComponentBase {
  protected render() {
    return html`
      <div class="background-container">
        <div class="logo-placeholder">
          <img src="/pix3-logo.png" alt="Pix3 Logo" />
          <p>Open a scene to start editing</p>
        </div>
      </div>
    `;
  }
}
