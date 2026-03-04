import { Camera3D } from '../nodes/3D/Camera3D';
import { NodeBase } from '../nodes/NodeBase';
import { LAYER_3D } from '../constants';

/**
 * Delegate interface implemented by SceneRunner to expose scene internals
 * without creating circular dependencies.
 */
export interface SceneServiceDelegate {
  getActiveCameraNode(): Camera3D | null;
  setActiveCameraNode(camera: Camera3D | null): void;
  findNodeById(id: string): NodeBase | null;
}

/**
 * SceneService - Provides runtime scene control APIs to game scripts.
 *
 * Injected into nodes and scripts by SceneRunner. Scripts access it via
 * `this.node?.scene` or the `scene` property on the Script base class.
 *
 * Example usage in a script:
 *
 * ```ts
 * // Switch active camera immediately
 * this.scene?.setActiveCamera('camera-node-id');
 *
 * // Switch with fade transition
 * this.scene?.switchCameraWithFade('camera-b-id', 0.5, 0.5, () => {
 *   console.log('Camera switch complete');
 * });
 *
 * // Manual fade control
 * this.scene?.fadeToBlack(0.5, () => {
 *   // do stuff at black screen
 *   this.scene?.fadeFromBlack(0.5);
 * });
 * ```
 */
export class SceneService {
  private delegate: SceneServiceDelegate | null = null;
  private fadeOverlay: HTMLDivElement | null = null;
  private fadeAnimationId: number | null = null;
  private canvas: HTMLCanvasElement | null = null;

  /**
   * Called by SceneRunner to provide access to scene internals.
   */
  setDelegate(delegate: SceneServiceDelegate | null): void {
    this.delegate = delegate;
  }

  /**
   * Called by SceneRunner to associate the canvas (used for fade overlay positioning).
   */
  attachCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
  }

  /**
   * Clean up the overlay and cancel any in-progress fade.
   */
  dispose(): void {
    this.cancelFade();
    this.fadeOverlay?.remove();
    this.fadeOverlay = null;
    this.canvas = null;
    this.delegate = null;
  }

  // ── Camera control ──────────────────────────────────────────────────────────

  /**
   * Immediately set the active 3D camera by node ID.
   * The specified Camera3D node becomes the primary rendering camera.
   */
  setActiveCamera(nodeId: string): void {
    if (!this.delegate) {
      console.warn('[SceneService] setActiveCamera: no scene delegate.');
      return;
    }
    const node = this.delegate.findNodeById(nodeId);
    if (!node) {
      console.warn(`[SceneService] setActiveCamera: node "${nodeId}" not found.`);
      return;
    }
    if (!(node instanceof Camera3D)) {
      console.warn(`[SceneService] setActiveCamera: node "${nodeId}" is not a Camera3D.`);
      return;
    }
    node.camera.layers.disableAll();
    node.camera.layers.enable(LAYER_3D);
    this.delegate.setActiveCameraNode(node);
  }

  /**
   * Switch to a different camera with a fade-to-black transition.
   * Timeline: fadeOut → (camera switch at black) → fadeIn.
   *
   * @param nodeId          ID of the Camera3D node to switch to
   * @param fadeOutDuration Duration of the fade-to-black in seconds (default 0.5)
   * @param fadeInDuration  Duration of the fade-from-black in seconds (default 0.5)
   * @param onComplete      Optional callback fired after the fade-in completes
   */
  switchCameraWithFade(
    nodeId: string,
    fadeOutDuration: number = 0.5,
    fadeInDuration: number = 0.5,
    onComplete?: () => void
  ): void {
    this.fadeToBlack(fadeOutDuration, () => {
      this.setActiveCamera(nodeId);
      this.fadeFromBlack(fadeInDuration, onComplete);
    });
  }

  // ── Screen fades ────────────────────────────────────────────────────────────

  /**
   * Fade the screen to black over the given duration in seconds.
   * Overlaps any existing fade.
   */
  fadeToBlack(duration: number, onComplete?: () => void): void {
    this.ensureFadeOverlay();
    if (!this.fadeOverlay) return;
    const currentOpacity = parseFloat(this.fadeOverlay.style.opacity ?? '0');
    this.cancelFade();
    this.animateFade(currentOpacity, 1, duration, onComplete);
  }

  /**
   * Fade the screen from black over the given duration in seconds.
   * Overlaps any existing fade.
   */
  fadeFromBlack(duration: number, onComplete?: () => void): void {
    this.ensureFadeOverlay();
    if (!this.fadeOverlay) return;
    const currentOpacity = parseFloat(this.fadeOverlay.style.opacity ?? '1');
    this.cancelFade();
    this.animateFade(currentOpacity, 0, duration, onComplete);
  }

  /**
   * Instantly set the screen overlay opacity (0 = transparent, 1 = fully black).
   * Useful for snapping to a specific fade state without animation.
   */
  setFadeOpacity(opacity: number): void {
    this.ensureFadeOverlay();
    if (!this.fadeOverlay) return;
    this.cancelFade();
    this.fadeOverlay.style.opacity = String(Math.max(0, Math.min(1, opacity)));
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private ensureFadeOverlay(): void {
    if (this.fadeOverlay) return;

    const parent = this.canvas?.parentElement;
    if (!parent) {
      console.warn('[SceneService] Cannot create fade overlay: canvas has no parent element.');
      return;
    }

    // Ensure the parent has a positioning context so `position: absolute` works
    const parentStyle = getComputedStyle(parent);
    if (parentStyle.position === 'static') {
      parent.style.position = 'relative';
    }

    this.fadeOverlay = document.createElement('div');
    this.fadeOverlay.style.cssText = [
      'position: absolute',
      'inset: 0',
      'background: #000000',
      'opacity: 0',
      'pointer-events: none',
      'z-index: 9999',
    ].join('; ');

    parent.appendChild(this.fadeOverlay);
  }

  private cancelFade(): void {
    if (this.fadeAnimationId !== null) {
      cancelAnimationFrame(this.fadeAnimationId);
      this.fadeAnimationId = null;
    }
  }

  private animateFade(
    from: number,
    to: number,
    duration: number,
    onComplete?: () => void
  ): void {
    if (!this.fadeOverlay) return;
    const overlay = this.fadeOverlay;
    const durationMs = Math.max(0, duration * 1000);

    if (durationMs === 0) {
      overlay.style.opacity = String(to);
      onComplete?.();
      return;
    }

    const startTime = performance.now();

    const step = (now: number): void => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / durationMs, 1);
      // Simple linear interpolation; easing can be added here if desired
      overlay.style.opacity = String(from + (to - from) * t);

      if (t < 1) {
        this.fadeAnimationId = requestAnimationFrame(step);
      } else {
        this.fadeAnimationId = null;
        onComplete?.();
      }
    };

    this.fadeAnimationId = requestAnimationFrame(step);
  }
}
