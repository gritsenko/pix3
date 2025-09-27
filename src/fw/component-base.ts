import { LitElement, type CSSResultGroup } from 'lit';

/**
 * Shared base class for Pix3 UI-компонентов.
 *
 * По умолчанию рендерит в light DOM, чтобы интегрироваться с глобальными стилями.
 * Установите `static useShadowDom = true` в наследнике, чтобы включить shadow DOM.
 */
export class ComponentBase extends LitElement {
    protected static useShadowDom = false;
    protected static lightDomStyleElement?: HTMLStyleElement;

    // Override createRenderRoot to respect the `useShadowDom` setting
    createRenderRoot() {
        if ((this.constructor as typeof ComponentBase).useShadowDom) {
            return super.createRenderRoot(); // Shadow DOM
        }

        return this; // Light DOM
    }

    connectedCallback(): void {
        if (!(this.constructor as typeof ComponentBase).useShadowDom) {
            (this.constructor as typeof ComponentBase).ensureLightDomStyles(this);
        }

        super.connectedCallback();
    }

    private static ensureLightDomStyles(instance: ComponentBase): void {
        if (typeof document === 'undefined') {
            return;
        }

        const ctor = this as typeof ComponentBase & {
            styles?: CSSResultGroup;
            lightDomStyleElement?: HTMLStyleElement | null;
        };

        if (!ctor.styles) {
            return;
        }

        if (ctor.lightDomStyleElement?.isConnected) {
            return;
        }

        const cssText = this.flattenStyles(ctor.styles, instance.localName);
        if (!cssText.trim()) {
            return;
        }

        const styleEl = document.createElement('style');
        styleEl.type = 'text/css';
        styleEl.setAttribute('data-pix3-component-style', instance.localName);
        styleEl.textContent = cssText;

        document.head.appendChild(styleEl);
        ctor.lightDomStyleElement = styleEl;
    }

    private static flattenStyles(styles: CSSResultGroup, hostSelector: string): string {
        if (Array.isArray(styles)) {
            return styles.map((style) => this.flattenStyles(style, hostSelector)).join('\n');
        }

        const cssResult = styles as { cssText?: string };
        const cssText = cssResult?.cssText ?? String(styles ?? '');
        return this.scopeHostSelectors(cssText, hostSelector);
    }

    private static scopeHostSelectors(cssText: string, hostSelector: string): string {
        if (!cssText.includes(':host')) {
            return cssText;
        }

        let result = '';
        let index = 0;

        while (index < cssText.length) {
            const hostIndex = cssText.indexOf(':host', index);
            if (hostIndex === -1) {
                result += cssText.slice(index);
                break;
            }

            result += cssText.slice(index, hostIndex);
            let cursor = hostIndex + 5; // skip ':host'

            const nextChar = cssText.charAt(cursor);
            if (nextChar === '-') {
                // Preserve pseudo-selectors like :host-context
                result += ':host';
                index = cursor;
                continue;
            }

            while (/\s/.test(cssText.charAt(cursor))) {
                cursor++;
            }

            if (cssText.charAt(cursor) === '(') {
                cursor++;
                let depth = 1;
                const selectorStart = cursor;

                while (cursor < cssText.length && depth > 0) {
                    const char = cssText.charAt(cursor);
                    if (char === '(') {
                        depth++;
                    } else if (char === ')') {
                        depth--;
                    }
                    cursor++;
                }

                const selectorContent = cssText.slice(selectorStart, cursor - 1);
                const scoped = selectorContent
                    .split(',')
                    .map((part) => {
                        const trimmed = part.trim();
                        return trimmed ? `${hostSelector}${trimmed}` : hostSelector;
                    })
                    .join(', ');

                result += scoped;
            } else {
                result += hostSelector;
            }

            index = cursor;
        }

        return result;
    }
}