declare module 'lit' {
    export class LitElement extends HTMLElement {
        createRenderRoot(): Element | ShadowRoot | this;
        requestUpdate(name?: PropertyKey, oldValue?: unknown): Promise<void>;
    }
}

declare module 'lit/decorators.js' {
    export const customElement: (...args: any[]) => ClassDecorator;
    export const property: (...args: any[]) => any;
    export const state: (...args: any[]) => any;
}
