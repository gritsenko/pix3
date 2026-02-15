
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

    public width = 0;
    public height = 0;

    private element: HTMLElement | null = null;

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
        const rect = element.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
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
    }

    private onPointerDown = (event: PointerEvent): void => {
        this.isPointerDown = true;
        this.updatePointerPosition(event);

        // Global "Tap to Action" - Map primary pointer down to "Action_Primary"
        this.setButton('Action_Primary', true);
    };

    private onPointerMove = (event: PointerEvent): void => {
        this.updatePointerPosition(event);
    };

    private onPointerUp = (event: PointerEvent): void => {
        this.isPointerDown = false;
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
        this.width = rect.width;
        this.height = rect.height;
        this.pointerPosition.set(
            event.clientX - rect.left,
            event.clientY - rect.top
        );
    }
}
