import { ComponentBase, css, customElement, html, property } from '../../fw';

@customElement('pix3-toolbar-button')
export class Pix3ToolbarButton extends ComponentBase {
	@property({ type: Boolean, reflect: true })
	disabled = false;

	@property({ type: Boolean, reflect: true })
	toggled = false;

	@property({ attribute: 'aria-label' })
	label: string | null = null;

	connectedCallback(): void {
		super.connectedCallback();
		this.setAttribute('role', 'button');
		this.setAttribute('aria-pressed', String(this.toggled));
		if (!this.hasAttribute('tabindex')) {
			this.tabIndex = -1;
		}
		this.updateAriaDisabled();
		this.setupEventListeners();
	}

	disconnectedCallback(): void {
		super.disconnectedCallback();
		this.removeEventListeners();
	}

	protected updated(changed: Map<string, unknown>): void {
		if (changed.has('toggled')) {
			this.setAttribute('aria-pressed', String(this.toggled));
		}

		if (changed.has('disabled')) {
			this.updateAriaDisabled();
		}

		if (changed.has('label')) {
			if (this.label) {
				this.setAttribute('aria-label', this.label);
			} else {
				this.removeAttribute('aria-label');
			}
		}
	}

	private keydownHandler = (event: KeyboardEvent) => {
		if (this.disabled) {
			return;
		}

		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			event.stopPropagation();
			this.click();
		}
	};

	private pointerDownHandler = (event: PointerEvent) => {
		if (this.disabled) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		this.focus();
	};

	private clickHandler = (event: MouseEvent) => {
		if (this.disabled) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	};

	private setupEventListeners(): void {
		this.addEventListener('keydown', this.keydownHandler);
		this.addEventListener('pointerdown', this.pointerDownHandler);
		this.addEventListener('click', this.clickHandler, { capture: true });
	}

	private removeEventListeners(): void {
		this.removeEventListener('keydown', this.keydownHandler);
		this.removeEventListener('pointerdown', this.pointerDownHandler);
		this.removeEventListener('click', this.clickHandler, { capture: true });
	}

	private updateAriaDisabled(): void {
		if (this.disabled) {
			this.setAttribute('aria-disabled', 'true');
			this.tabIndex = -1;
		} else {
			this.removeAttribute('aria-disabled');
			if (!this.hasAttribute('tabindex')) {
				this.tabIndex = -1;
			}
		}
	}

	protected render() {
		return html`<span class="toolbar-button"><slot></slot></span>`;
	}

	static styles = css`
		:host {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			min-width: 2.25rem;
			padding: 0.4rem 0.9rem;
			border-radius: 0.5rem;
			background: var(--pix3-toolbar-button-background, rgba(60, 68, 82, 0.32));
			color: var(--pix3-toolbar-button-foreground, rgba(245, 247, 250, 0.95));
			font-size: 0.82rem;
			font-weight: 600;
			letter-spacing: 0.02em;
			text-transform: none;
			line-height: 1;
			cursor: pointer;
			user-select: none;
			transition: background 120ms ease, box-shadow 120ms ease, transform 120ms ease;
		}

		:host(:focus-visible) {
			outline: none;
			box-shadow: 0 0 0 2px rgba(94, 194, 255, 0.85);
		}

		:host(:hover) {
			background: rgba(82, 94, 114, 0.48);
			transform: translateY(-1px);
		}

		:host([toggled]) {
			background: rgba(48, 164, 255, 0.3);
			box-shadow: inset 0 0 0 1px rgba(48, 164, 255, 0.48);
		}

		:host([disabled]) {
			cursor: not-allowed;
			opacity: 0.55;
			box-shadow: none;
			transform: none;
		}

		.toolbar-button {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 0.4rem;
		}
	`;
}

declare global {
	interface HTMLElementTagNameMap {
		'pix3-toolbar-button': Pix3ToolbarButton;
	}
}
