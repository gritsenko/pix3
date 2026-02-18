
import { Vector2 } from 'three';

/**
 * InputService - Central hub for handling user input.
 * Manages virtual axes, buttons, and raw pointer events.
 */
export class InputService {
    private axes = new Map<string, number>();
    private buttons = new Map<string, boolean>();

    // Raw pointer state
    public readonly pointerPosition = new Vector2();
    public isPointerDown = false;
    public activePointerId: number | null = null;

    public width = 0;
    public height = 0;

    private hoveredUIElements = new Set<string>();

    private element: HTMLElement | null = null;

    /**
     * Resets frame-based input state. Should be called at the start of each frame.
     */
    beginFrame(): void {
        this.hoveredUIElements.clear();
    }

    /**
     * Registers that a UI element is currently being hovered by the pointer.
     */
    registerHover(id: string): void {
        this.hoveredUIElements.add(id);
    }

    /**
     * Returns true if any UI element is currently hovered.
     */
    get isHoveringUI(): boolean {
        return this.hoveredUIElements.size > 0;
    }

    /**
     * Set a virtual axis value (e.g. from a specialized controller or script).
     * @param name Name of the axis (e.g. "Horizontal", "Vertical")
     * @param value Value typically between -1 and 1
     */
    setAxis(name: string, value: number): void {
        this.axes.set(name, value);
    }

    /**
     * Get a virtual axis value.
     * @param name Name of the axis
     * @returns The current value of the axis, or 0 if not set
     */
    getAxis(name: string): number {
        return this.axes.get(name) || 0;
    }

    /**
     * Set a virtual button state.
     * @param name Name of the button (e.g. "Jump", "Fire")
     * @param pressed Whether the button is pressed
     */
    setButton(name: string, pressed: boolean): void {
        this.buttons.set(name, pressed);
    }

    /**
     * Get a virtual button state.
     * @param name Name of the button
     * @returns True if the button is currently pressed
     */
    getButton(name: string): boolean {
        return this.buttons.get(name) || false;
    }

    /**
     * Attach global event listeners to a DOM element.
     * Monitors pointer events to update raw pointer state and trigger global actions.
     * @param element The DOM element (usually canvas) to listen to
     */
    attach(element: HTMLElement): void {
        this.detach(); // detach previous if any
        this.element = element;

        // Initialize dimensions
        const dimensions = this.getInputDimensions();
        this.width = dimensions.width;
        this.height = dimensions.height;
        console.log(`[InputService] Attached to element. Dimensions: ${this.width}x${this.height}`);

        element.addEventListener('pointerdown', this.onPointerDown);
        element.addEventListener('pointermove', this.onPointerMove);
        element.addEventListener('pointerup', this.onPointerUp);
        element.addEventListener('pointercancel', this.onPointerUp);
        element.addEventListener('pointerleave', this.onPointerUp);

        // Prevent context menu on right click for better game experience
        element.addEventListener('contextmenu', this.onContextMenu);
    }

    /**
     * Remove global event listeners.
     */
    detach(): void {
        if (!this.element) return;

        this.element.removeEventListener('pointerdown', this.onPointerDown);
        this.element.removeEventListener('pointermove', this.onPointerMove);
        this.element.removeEventListener('pointerup', this.onPointerUp);
        this.element.removeEventListener('pointercancel', this.onPointerUp);
        this.element.removeEventListener('pointerleave', this.onPointerUp);
        this.element.removeEventListener('contextmenu', this.onContextMenu);

        this.element = null;
        this.isPointerDown = false;
        this.activePointerId = null;
        this.setButton('Action_Primary', false);
    }

    private onPointerDown = (event: PointerEvent): void => {
        if (this.activePointerId !== null) {
            return;
        }

        this.activePointerId = event.pointerId;
        this.isPointerDown = true;
        this.updatePointerPosition(event);

        // Global "Tap to Action" - Map primary pointer down to "Action_Primary"
        this.setButton('Action_Primary', true);
    };

    private onPointerMove = (event: PointerEvent): void => {
        if (this.activePointerId !== event.pointerId) {
            return;
        }
        this.updatePointerPosition(event);
    };

    private onPointerUp = (event: PointerEvent): void => {
        if (this.activePointerId !== event.pointerId) {
            return;
        }

        this.isPointerDown = false;
        this.activePointerId = null;
        this.updatePointerPosition(event);

        // Release "Action_Primary"
        this.setButton('Action_Primary', false);
    };

    private onContextMenu = (event: Event): void => {
        event.preventDefault();
    };

    private updatePointerPosition(event: PointerEvent): void {
        if (!this.element) return;

        // Calculate position relative to the element
        const rect = this.element.getBoundingClientRect();
        const dimensions = this.getInputDimensions();
        this.width = dimensions.width;
        this.height = dimensions.height;

        const safeRectWidth = rect.width > 0 ? rect.width : 1;
        const safeRectHeight = rect.height > 0 ? rect.height : 1;
        const scaleX = this.width / safeRectWidth;
        const scaleY = this.height / safeRectHeight;

        this.pointerPosition.set(
            (event.clientX - rect.left) * scaleX,
            (event.clientY - rect.top) * scaleY
        );
    }

    private getInputDimensions(): { width: number; height: number } {
        if (!this.element) {
            return { width: 0, height: 0 };
        }

        if (this.element instanceof HTMLCanvasElement) {
            const canvasWidth = this.element.width;
            const canvasHeight = this.element.height;
            if (canvasWidth > 0 && canvasHeight > 0) {
                return { width: canvasWidth, height: canvasHeight };
            }
        }

        const rect = this.element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
    }
}
