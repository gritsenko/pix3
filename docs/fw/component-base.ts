import { LitElement } from 'lit';

/**
 * Shared base class for Pix3 UI-компонентов.
 *
 * По умолчанию рендерит в light DOM, чтобы интегрироваться с глобальными стилями.
 * Установите `static useShadowDom = true` в наследнике, чтобы включить shadow DOM.
 */
export class ComponentBase extends LitElement {
    protected static useShadowDom = false;

    // Override createRenderRoot to respect the `useShadowDom` setting
    createRenderRoot() {
        if ((this.constructor as typeof ComponentBase).useShadowDom) {
            return super.createRenderRoot(); // Shadow DOM
        }

        return this; // Light DOM
    }
}