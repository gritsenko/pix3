import { INPUT } from '../config';

// Gesture states for each pointer
export enum GestureState {
  IDLE = 'idle',           // No active gesture
  PENDING = 'pending',     // Waiting to determine gesture type
  INTERACT = 'interact',   // Block/resource interaction mode
  SWIPE_H = 'swipe_h',     // Horizontal swipe (tower rotation)
  SWIPE_V = 'swipe_v',     // Vertical swipe (camera scroll)
}

// Per-pointer tracking state
export interface PointerState {
  id: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  prevX: number;
  prevY: number;
  startTime: number;
  lastMoveTime: number;
  state: GestureState;
  velocityX: number;       // px/ms
  velocityY: number;       // px/ms
  totalDeltaX: number;     // Accumulated horizontal movement
  totalDeltaY: number;     // Accumulated vertical movement
  holdTriggered: boolean;  // Whether hold callback was fired
}

// Callbacks interface - simplified and touch-first
export interface InputCallbacks {
  // Pointer lifecycle
  onPointerDown: (pointerId: number, screenX: number, screenY: number) => void;
  onPointerMove: (pointerId: number, screenX: number, screenY: number, source?: 'mouse' | 'pointer') => void;
  onPointerUp: (pointerId: number, screenX: number, screenY: number) => void;

  // Hold detection (for drill)
  onHoldStart: (pointerId: number, screenX: number, screenY: number) => void;
  onHoldEnd: (pointerId: number) => void;

  // Gestures - single-step rotation and scroll
  onRotateStep: (direction: -1 | 1) => void;
  onVerticalScroll: (deltaY: number) => void;
}

export class InputManager {
  private pointers: Map<number, PointerState> = new Map();
  private callbacks: InputCallbacks;
  private canvas: HTMLCanvasElement;

  // Hold timers per pointer
  private holdTimers: Map<number, number> = new Map();

  // Track if a horizontal swipe was already triggered (to prevent multiple rotations per swipe)
  private swipeRotationFired: boolean = false;

  // Trackpad swipe accumulation
  private trackpadDeltaXAccum: number = 0;
  private lastTrackpadWheelTime: number = 0;
  private trackpadRotationFired: boolean = false;

  // Bound handlers for cleanup
  private boundHandlers: {
    touchStart: (e: TouchEvent) => void;
    touchMove: (e: TouchEvent) => void;
    touchEnd: (e: TouchEvent) => void;
    mouseDown: (e: MouseEvent) => void;
    mouseMove: (e: MouseEvent) => void;
    mouseUp: (e: MouseEvent) => void;
    keyDown: (e: KeyboardEvent) => void;
  };

  constructor(canvas: HTMLCanvasElement, callbacks: InputCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    // Bind handlers once for proper cleanup
    this.boundHandlers = {
      touchStart: this.onTouchStart.bind(this),
      touchMove: this.onTouchMove.bind(this),
      touchEnd: this.onTouchEnd.bind(this),
      mouseDown: this.onMouseDown.bind(this),
      mouseMove: this.onMouseMove.bind(this),
      mouseUp: this.onMouseUp.bind(this),
      keyDown: this.onKeyDown.bind(this),
    };

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Wheel event for two-finger trackpad scrolling
    this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    // Touch events
    this.canvas.addEventListener('touchstart', this.boundHandlers.touchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.boundHandlers.touchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.boundHandlers.touchEnd, { passive: false });
    this.canvas.addEventListener('touchcancel', this.boundHandlers.touchEnd, { passive: false });

    // Mouse events (for desktop testing)
    this.canvas.addEventListener('mousedown', this.boundHandlers.mouseDown);
    this.canvas.addEventListener('mousemove', this.boundHandlers.mouseMove);
    this.canvas.addEventListener('mouseup', this.boundHandlers.mouseUp);
    this.canvas.addEventListener('mouseleave', this.boundHandlers.mouseUp);

    // Keyboard events
    window.addEventListener('keydown', this.boundHandlers.keyDown);
  }

  // ========================================
  // Touch Event Handlers
  // ========================================

  private onTouchStart(event: TouchEvent): void {
    event.preventDefault();

    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      this.handlePointerStart(touch.identifier, touch.clientX, touch.clientY);
    }
  }

  private onTouchMove(event: TouchEvent): void {
    event.preventDefault();

    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      this.handlePointerMove(touch.identifier, touch.clientX, touch.clientY);
    }
  }

  private onTouchEnd(event: TouchEvent): void {
    event.preventDefault();

    for (let i = 0; i < event.changedTouches.length; i++) {
      const touch = event.changedTouches[i];
      this.handlePointerEnd(touch.identifier, touch.clientX, touch.clientY);
    }
  }

  // ========================================
  // Mouse Event Handlers (Desktop)
  // ========================================

  private mousePointerId = -1;
  private isMouseDown = false;

  private onMouseDown(event: MouseEvent): void {
    this.isMouseDown = true;
    this.handlePointerStart(this.mousePointerId, event.clientX, event.clientY);
  }

  private onMouseMove(event: MouseEvent): void {
    // Always send pointer move for hover (even when not pressed)
    if (!this.isMouseDown) {
      // Just update hover state without gesture detection
      this.callbacks.onPointerMove(this.mousePointerId, event.clientX, event.clientY, 'mouse'); // Adding a source for event distinction
      return;
    }

    this.handlePointerMove(this.mousePointerId, event.clientX, event.clientY);
  }

  private onMouseUp(event: MouseEvent): void {
    if (!this.isMouseDown) return;
    this.isMouseDown = false;
    this.handlePointerEnd(this.mousePointerId, event.clientX, event.clientY);
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // Vertical scroll - inverted so positive deltaY scrolls down (into the mine)
    if (event.deltaY !== 0) {
      this.callbacks.onVerticalScroll(-event.deltaY * INPUT.swipeVertical.sensitivity);
    }

    // Horizontal trackpad swipe for tower rotation with accumulation and threshold
    if (event.deltaX !== 0 && INPUT.trackpadSwipe.enabled) {
      const now = Date.now();
      const timeSinceLastWheel = now - this.lastTrackpadWheelTime;

      // Reset accumulation if too much time has passed (new swipe)
      if (timeSinceLastWheel > INPUT.trackpadSwipe.resetTime) {
        this.trackpadDeltaXAccum = 0;
        this.trackpadRotationFired = false;
      }

      this.trackpadDeltaXAccum += event.deltaX * INPUT.trackpadSwipe.sensitivity;
      this.lastTrackpadWheelTime = now;

      // Check if accumulation exceeded threshold and rotation not yet fired
      const absAccum = Math.abs(this.trackpadDeltaXAccum);
      if (!this.trackpadRotationFired && absAccum >= INPUT.trackpadSwipe.threshold) {
        const direction = this.trackpadDeltaXAccum > 0 ? 1 : -1;
        this.callbacks.onRotateStep(direction);
        this.trackpadRotationFired = true;
      }
    }
  }

  // ========================================
  // Keyboard Event Handlers
  // ========================================

  private onKeyDown(event: KeyboardEvent): void {
    // Prevent auto-repeat for rotation steps
    if (event.repeat) return;

    // Left/Right arrow keys or A/D keys for rotation
    if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
      this.callbacks.onRotateStep(-1);
    } else if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
      this.callbacks.onRotateStep(1);
    }
  }

  // ========================================
  // Unified Pointer Handling
  // ========================================

  private handlePointerStart(id: number, x: number, y: number): void {
    const now = Date.now();

    const state: PointerState = {
      id,
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
      prevX: x,
      prevY: y,
      startTime: now,
      lastMoveTime: now,
      state: GestureState.PENDING,
      velocityX: 0,
      velocityY: 0,
      totalDeltaX: 0,
      totalDeltaY: 0,
      holdTriggered: false,
    };

    this.pointers.set(id, state);

    // Notify game of pointer down (for immediate interaction)
    this.callbacks.onPointerDown(id, x, y);

    // Start hold detection timer
    this.startHoldTimer(id, x, y);
  }

  private handlePointerMove(id: number, x: number, y: number): void {
    const state = this.pointers.get(id);
    if (!state) return;

    const now = Date.now();
    const dt = Math.max(1, now - state.lastMoveTime); // Avoid division by zero

    // Calculate deltas
    const deltaX = x - state.prevX;
    const deltaY = y - state.prevY;

    // Update velocities (exponential smoothing)
    const alpha = 0.3;
    state.velocityX = alpha * (deltaX / dt) + (1 - alpha) * state.velocityX;
    state.velocityY = alpha * (deltaY / dt) + (1 - alpha) * state.velocityY;

    // Update totals
    state.totalDeltaX += deltaX;
    state.totalDeltaY += deltaY;

    // Update position
    state.prevX = state.currentX;
    state.prevY = state.currentY;
    state.currentX = x;
    state.currentY = y;
    state.lastMoveTime = now;

    // Process based on current gesture state
    switch (state.state) {
      case GestureState.PENDING:
        this.processGestureDecision(state);
        break;

      case GestureState.INTERACT:
        // Even in INTERACT mode, check if a large swipe is happening
        // This allows swipe detection after hold timeout has fired
        this.checkForSwipeOverride(state);
        // Update hover/interaction target
        this.callbacks.onPointerMove(id, x, y);
        break;

      case GestureState.SWIPE_H:
        this.processHorizontalSwipe(state);
        break;

      case GestureState.SWIPE_V:
        this.processVerticalSwipe(state, deltaY);
        break;
    }
  }

  private handlePointerEnd(id: number, x: number, y: number): void {
    const state = this.pointers.get(id);
    if (!state) return;

    // Cancel hold timer
    this.cancelHoldTimer(id);

    // If was holding, notify hold end
    if (state.holdTriggered) {
      this.callbacks.onHoldEnd(id);
    }

    // Notify pointer up
    this.callbacks.onPointerUp(id, x, y);

    // Reset swipe rotation flag when all pointers are released
    this.pointers.delete(id);
    if (this.pointers.size === 0) {
      this.swipeRotationFired = false;
    }
  }

  // ========================================
  // Gesture Detection Logic
  // ========================================

  private processGestureDecision(state: PointerState): void {
    const now = Date.now();
    const elapsed = now - state.startTime;

    const absX = Math.abs(state.totalDeltaX);
    const absY = Math.abs(state.totalDeltaY);
    const totalDistance = Math.sqrt(absX * absX + absY * absY);

    // Check if we've moved enough to decide (don't use timeout constraint)
    if (totalDistance < INPUT.gestureDetection.decisionDistance) {
      // Not enough movement yet - stay in pending, still show hover updates
      this.callbacks.onPointerMove(state.id, state.currentX, state.currentY);
      return;
    }

    // Calculate velocity and linearity
    const velocityMagnitude = Math.sqrt(
      state.velocityX * state.velocityX +
      state.velocityY * state.velocityY
    );

    // Determine gesture type based on direction, velocity, and linearity
    const isHorizontalDominant = absX > absY;
    const verticalRatio = absX > 0 ? absY / absX : Infinity;
    const horizontalRatio = absY > 0 ? absX / absY : Infinity;

    // Check for horizontal swipe (tower rotation)
    if (isHorizontalDominant &&
      verticalRatio < INPUT.swipeHorizontal.maxVerticalRatio &&
      velocityMagnitude > INPUT.swipeHorizontal.minVelocity &&
      elapsed < INPUT.swipeHorizontal.maxDuration) {
      state.state = GestureState.SWIPE_H;
      this.cancelHoldTimer(state.id);
      return;
    }

    // Check for vertical swipe (camera scroll)
    if (INPUT.swipeVertical.enabled &&
      !isHorizontalDominant &&
      horizontalRatio < INPUT.swipeVertical.maxHorizontalRatio &&
      absY >= INPUT.gestureDetection.decisionDistance) {
      state.state = GestureState.SWIPE_V;
      this.cancelHoldTimer(state.id);
      return;
    }

    // Default to interact mode
    state.state = GestureState.INTERACT;
    this.callbacks.onPointerMove(state.id, state.currentX, state.currentY);
  }

  // Check if what started as INTERACT should become a swipe (after hold timeout)
  private checkForSwipeOverride(state: PointerState): void {
    const absX = Math.abs(state.totalDeltaX);
    const absY = Math.abs(state.totalDeltaY);

    // Only check if we haven't fired rotation yet
    if (this.swipeRotationFired) return;

    const isHorizontalDominant = absX > absY;
    const verticalRatio = absX > 0 ? absY / absX : Infinity;

    // If significant horizontal movement with good linearity, trigger rotation
    if (isHorizontalDominant &&
      verticalRatio < INPUT.swipeHorizontal.maxVerticalRatio &&
      absX >= INPUT.swipeHorizontal.threshold) {
      const direction = state.totalDeltaX > 0 ? -1 : 1;
      this.callbacks.onRotateStep(direction);
      this.swipeRotationFired = true;
      state.state = GestureState.SWIPE_H;
      this.cancelHoldTimer(state.id);
    }
  }

  private processHorizontalSwipe(state: PointerState): void {
    const absX = Math.abs(state.totalDeltaX);
    const absY = Math.abs(state.totalDeltaY);
    const elapsed = Date.now() - state.startTime;

    // Check linearity - if movement becomes too vertical, cancel swipe
    const verticalRatio = absX > 0 ? absY / absX : Infinity;
    if (verticalRatio > INPUT.swipeHorizontal.maxVerticalRatio * 1.5) {
      // Swipe became non-linear - switch to interact
      state.state = GestureState.INTERACT;
      return;
    }

    // Check if duration exceeded (allow longer swipes)
    if (elapsed > INPUT.swipeHorizontal.maxDuration * 2) {
      state.state = GestureState.INTERACT;
      return;
    }

    // Check if we've reached the threshold for rotation
    if (!this.swipeRotationFired && absX >= INPUT.swipeHorizontal.threshold) {
      const direction = state.totalDeltaX > 0 ? -1 : 1;
      this.callbacks.onRotateStep(direction);
      this.swipeRotationFired = true;
    }
  }

  private processVerticalSwipe(state: PointerState, deltaY: number): void {
    const absX = Math.abs(state.totalDeltaX);
    const absY = Math.abs(state.totalDeltaY);

    // Check linearity - if movement becomes too horizontal, cancel swipe
    const horizontalRatio = absY > 0 ? absX / absY : Infinity;
    if (horizontalRatio > INPUT.swipeVertical.maxHorizontalRatio * 1.5) {
      state.state = GestureState.INTERACT;
      return;
    }

    // Apply scroll (negative deltaY = scroll down into mine, positive = scroll up)
    if (Math.abs(deltaY) > 0) {
      this.callbacks.onVerticalScroll(deltaY * INPUT.swipeVertical.sensitivity);
    }
  }

  // ========================================
  // Hold Detection
  // ========================================

  private startHoldTimer(id: number, _x: number, _y: number): void {
    this.cancelHoldTimer(id);

    const timer = window.setTimeout(() => {
      const state = this.pointers.get(id);
      if (!state) return;

      // Only trigger hold if still in pending/interact state and hasn't moved much
      const totalDistance = Math.sqrt(
        Math.pow(state.currentX - state.startX, 2) +
        Math.pow(state.currentY - state.startY, 2)
      );

      if ((state.state === GestureState.PENDING || state.state === GestureState.INTERACT) &&
        totalDistance < INPUT.tap.maxDistance * 2) {
        state.holdTriggered = true;
        state.state = GestureState.INTERACT;
        this.callbacks.onHoldStart(id, state.currentX, state.currentY);
      }
    }, INPUT.hold.threshold);

    this.holdTimers.set(id, timer);
  }

  private cancelHoldTimer(id: number): void {
    const timer = this.holdTimers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.holdTimers.delete(id);
    }
  }

  // ========================================
  // Public API
  // ========================================

  // Get all active pointer states (for multi-touch tracking)
  getActivePointers(): PointerState[] {
    return Array.from(this.pointers.values());
  }

  // Get pointer state by ID
  getPointerState(id: number): PointerState | undefined {
    return this.pointers.get(id);
  }

  // Reset all input state (useful when game is paused/unfocused)
  reset(): void {
    // Clear all hold timers
    for (const timer of this.holdTimers.values()) {
      clearTimeout(timer);
    }
    this.holdTimers.clear();

    // Notify about hold ends if they were active
    for (const [id, state] of this.pointers.entries()) {
      if (state.holdTriggered) {
        this.callbacks.onHoldEnd(id);
      }
    }

    this.pointers.clear();
    this.swipeRotationFired = false;
    this.trackpadRotationFired = false;
    this.trackpadDeltaXAccum = 0;
  }

  // Dispose
  dispose(): void {
    this.canvas.removeEventListener('touchstart', this.boundHandlers.touchStart);
    this.canvas.removeEventListener('touchmove', this.boundHandlers.touchMove);
    this.canvas.removeEventListener('touchend', this.boundHandlers.touchEnd);
    this.canvas.removeEventListener('touchcancel', this.boundHandlers.touchEnd);
    this.canvas.removeEventListener('mousedown', this.boundHandlers.mouseDown);
    this.canvas.removeEventListener('mousemove', this.boundHandlers.mouseMove);
    this.canvas.removeEventListener('mouseup', this.boundHandlers.mouseUp);
    this.canvas.removeEventListener('mouseleave', this.boundHandlers.mouseUp);
    window.removeEventListener('keydown', this.boundHandlers.keyDown);

    // Clear all hold timers
    for (const timer of this.holdTimers.values()) {
      clearTimeout(timer);
    }
    this.holdTimers.clear();
    this.pointers.clear();
  }
}
