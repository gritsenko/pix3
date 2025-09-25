import { LitElement } from 'lit';

export class ComponentBase extends LitElement {
    protected static useShadowDom = false;
    // Override createRenderRoot to respect the `useShadowDom` setting
    createRenderRoot() {
        if ((this.constructor as typeof ComponentBase).useShadowDom) {
            return super.createRenderRoot(); // Shadow DOM
        } else {
            return this; // Light DOM
        }
    }
}