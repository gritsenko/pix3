import * as THREE from 'three';
import { CAMERA, INPUT, GRID, BLOCK_RENDERING } from '../config';
import { HapticSystem } from '../systems/HapticSystem';

export class CameraController {
  public camera: THREE.OrthographicCamera;
  private pivot: THREE.Object3D;
  private targetYaw: number = Math.PI / 4; // Start at 45 degrees for isometric view
  private currentYaw: number = Math.PI / 4;
  private isRotating: boolean = false;
  private pivotY: number = 0; // Current base camera depth
  private targetPivotY: number = 0; // Target base camera depth
  private pitch: number = CAMERA.pitch; // Use pitch from config
  private baseFrustumSize: number = CAMERA.frustumSize;
  private frustumSize: number = CAMERA.frustumSize;
  private lastAspect: number = 1; // stored so runtime updates (zoom) can recalc projection
  private zoomFactor: number = 1.0; // 1.0 = default, >1 = zoomed out (larger frustum)

  // Scroll depth tracking
  private targetScrollY: number = 0;   // Target scroll position (negative = deeper)
  private currentScrollY: number = 0;  // Current scroll position
  private isScrolling: boolean = false;
  private maxScrollDepth: number = 2;  // Maximum depth user can scroll to

  // Elastic animation parameters
  private rotationVelocity: number = 0;
  private readonly ROTATION_SPRING = 440;    // Increased from 220 for 2x faster turn
  private readonly ROTATION_DAMPING = 0.65; // Higher damping to minimize overshoot

  // Shake parameters
  private shakeIntensity: number = 0;
  private shakeDecay: number = 0.9;
  private shakeDuration: number = 0; // Current shake duration remaining (in seconds)

  constructor(aspect: number, existingCamera?: THREE.OrthographicCamera) {
    // store current aspect for runtime recalcs (e.g. zoom updates)
    this.lastAspect = aspect;

    if (existingCamera) {
        this.camera = existingCamera;
        // Don't re-init projection here, wait for resize()
    } else {
        // Create orthographic camera for true isometric view
        this.frustumSize = this.computeFrustumSize(aspect);
        const halfWidth = this.frustumSize * aspect / 2;
        const halfHeight = this.frustumSize / 2;

        this.camera = new THREE.OrthographicCamera(
            -halfWidth,
            halfWidth,
            halfHeight,
            -halfHeight,
            CAMERA.near,
            CAMERA.far
        );
    }

    // Create pivot point for rotation
    this.pivot = new THREE.Object3D();
    this.pivot.add(this.camera);

    // Position camera for isometric view (matching reference image)
    // ~35 degrees down from horizontal, looking at center
    const distance = CAMERA.distance;
    this.camera.position.set(
      0,
      distance * Math.sin(this.pitch),
      distance * Math.cos(this.pitch)
    );
    this.camera.lookAt(0, 0, 0);

    // Initialize rotation
    this.pivot.rotation.y = this.currentYaw;
  }

  private computeFrustumSize(aspect: number): number {
    // Apply zoomFactor to the base frustum size so Debug slider can enlarge/reduce view
    const baseSizeWithZoom = this.baseFrustumSize * this.zoomFactor;

    if (aspect >= 1) {
      return baseSizeWithZoom;
    }

    const towerWidth = (GRID.maxX - GRID.minX + 1) * BLOCK_RENDERING.geometrySize;
    const margin = CAMERA.portraitFitMargin;
    const targetWidth = towerWidth * (1 + margin * 2);
    const fitFrustumSize = targetWidth / Math.max(aspect, 0.0001);

    return Math.max(baseSizeWithZoom, fitFrustumSize);
  }

  get pivotObject(): THREE.Object3D {
    return this.pivot;
  }

  // Single-step rotation (90 degrees) with elastic animation
  rotateStep(direction: -1 | 1): void {
    const snapAngle = CAMERA.rotationSnap; // 90 degrees
    this.targetYaw += direction * snapAngle;
    this.isRotating = true;
  }

  // Legacy rotate method - now deprecated, kept for compatibility
  rotate(deltaYaw: number): void {
    this.targetYaw -= deltaYaw * 2; // Inverted and 2x speed
    this.isRotating = true;
  }

  // Snap to nearest 90-degree angle (offset from 45 degrees) - legacy
  snapToGrid(): void {
    const snapAngle = CAMERA.rotationSnap;
    const baseOffset = Math.PI / 4; // 45 degrees
    // Snap to 45° + 90°*n
    this.targetYaw = baseOffset + Math.round((this.targetYaw - baseOffset) / snapAngle) * snapAngle;
    this.isRotating = true;
  }

  // Set absolute rotation
  setRotation(yaw: number): void {
    this.targetYaw = yaw;
    this.isRotating = true;
  }

  // Camera zoom factor (1.0 = default frustum). >1 = zoom out (larger frustum).
  setZoomFactor(factor: number): void {
    this.zoomFactor = Math.max(0.1, Math.min(25.0, factor));
    // Recalculate projection immediately using last known aspect
    this.resize(this.lastAspect);
  }

  getZoomFactor(): number {
    return this.zoomFactor;
  }

  // Trigger camera shake with configurable amplitude and duration
  shake(amplitude: number = 0.08, duration: number = 0.15): void {
    // Set to the requested amplitude (don't accumulate to avoid motion sickness)
    this.shakeIntensity = Math.min(amplitude, 1.0);
    this.shakeDuration = Math.max(this.shakeDuration, duration);
    
    // Trigger haptic feedback for big camera shake (above threshold)
    if (this.shakeIntensity > 0.15) {
      HapticSystem.bigShake();
    }
  }

  // Set camera depth directly
  setDepth(depth: number, maxDepth?: number): void {
    this.targetPivotY = -depth;
    if (maxDepth !== undefined) {
      this.maxScrollDepth = maxDepth;
    }

    // Maintain relative target scroll within new bounds
    const totalTarget = this.targetPivotY + this.targetScrollY;
    const clampedTotal = Math.max(-this.maxScrollDepth, Math.min(0, totalTarget));
    this.targetScrollY = clampedTotal - this.targetPivotY;

    // Set scrolling to true to smooth towards new depth
    this.isScrolling = true;
  }

  // Scroll camera up/down (for vertical swipe gesture)
  scrollDepth(delta: number): void {
    if (!INPUT.swipeVertical.enabled) return;

    // delta > 0 = scroll up (towards surface)
    // delta < 0 = scroll down (deeper)
    this.targetScrollY += delta;

    // Clamp total position instead of relative offset
    const totalTarget = this.targetPivotY + this.targetScrollY;
    const clampedTotal = Math.max(-this.maxScrollDepth, Math.min(0, totalTarget));
    this.targetScrollY = clampedTotal - this.targetPivotY;

    this.isScrolling = true;
  }

  // Get current depth
  getDepth(): number {
    return -this.pivotY;
  }

  // Handle floating origin reset
  handleFloatingOrigin(): { offset: number; needsReset: boolean } {
    if (Math.abs(this.pivotY) > 500) {
      const offset = this.pivotY;
      this.pivotY = 0;
      this.targetPivotY = 0;
      this.pivot.position.y = 0;
      return { offset, needsReset: true };
    }
    return { offset: 0, needsReset: false };
  }

  // Update camera each frame
  update(delta: number = 1 / 60): void {
    // 1. Elastic rotation animation (spring physics)
    if (this.isRotating) {
      const diff = this.targetYaw - this.currentYaw;

      // Spring force
      const springForce = diff * this.ROTATION_SPRING;
      this.rotationVelocity += springForce * delta;
      this.rotationVelocity *= Math.pow(this.ROTATION_DAMPING, delta * 60); // Framerate-independent damping

      this.currentYaw += this.rotationVelocity * delta;

      // Check if settled
      if (Math.abs(diff) < 0.01 && Math.abs(this.rotationVelocity) < 0.01) {
        this.currentYaw = this.targetYaw;
        this.rotationVelocity = 0;
        this.isRotating = false;
      }

      this.pivot.rotation.y = this.currentYaw;
    }

    // 2. Camera Shake logic
    // Update shake duration and decay intensity based on time
    if (this.shakeDuration > 0) {
      this.shakeDuration -= delta;
      // If duration expires, start decaying intensity
      if (this.shakeDuration <= 0) {
        this.shakeDuration = 0;
      }
    } else if (this.shakeIntensity > 0.001) {
      // Decay shake intensity when duration is over
      this.shakeIntensity *= Math.pow(this.shakeDecay, delta * 60);
    }

    if (this.shakeIntensity > 0.001) {
      // Base position for isometric camera (must match constructor)
      const distance = CAMERA.distance;
      const pitch = this.pitch;
      const baseX = 0;
      const baseY = distance * Math.sin(pitch);
      const baseZ = distance * Math.cos(pitch);

      const sx = (Math.random() - 0.5) * this.shakeIntensity;
      const sy = (Math.random() - 0.5) * this.shakeIntensity;
      const sz = (Math.random() - 0.5) * this.shakeIntensity;

      // Set absolute position relative to base, not relative to current (which might already be offset)
      this.camera.position.set(baseX + sx, baseY + sy, baseZ + sz);
    } else if (this.shakeIntensity > 0) {
      this.shakeIntensity = 0;
      // Reset position to remove offset drift
      const distance = CAMERA.distance;
      const pitch = this.pitch;
      this.camera.position.set(0, distance * Math.sin(pitch), distance * Math.cos(pitch));
    }

    // 3. Smooth scroll and depth animation
    if (this.isScrolling) {
      const scrollDiff = this.targetScrollY - this.currentScrollY;
      const depthDiff = this.targetPivotY - this.pivotY;

      let moving = false;

      // Smooth depth lerp (base camera position)
      if (Math.abs(depthDiff) < 0.01) {
        this.pivotY = this.targetPivotY;
      } else {
        this.pivotY += depthDiff * 0.1;
        moving = true;
      }

      // Smooth scroll lerp (manual offset)
      if (Math.abs(scrollDiff) < 0.01) {
        this.currentScrollY = this.targetScrollY;
      } else {
        this.currentScrollY += scrollDiff * 0.15;
        moving = true;
      }

      // Update position (additive base + scroll)
      this.pivot.position.y = this.pivotY + this.currentScrollY;

      if (!moving) {
        this.isScrolling = false;
      }
    }
  }

  // Handle window resize
  resize(aspect: number): void {
    // remember aspect for future runtime updates (zoom slider)
    this.lastAspect = aspect;

    this.frustumSize = this.computeFrustumSize(aspect);
    const halfWidth = this.frustumSize * aspect / 2;
    const halfHeight = this.frustumSize / 2;

    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }

  // Get current yaw for UI/state
  getCurrentYaw(): number {
    return this.currentYaw;
  }

  // Get current vertical view position (including scroll)
  getViewY(): number {
    return this.pivot.position.y;
  }

  // Get camera world position for raycasting
  getWorldPosition(): THREE.Vector3 {
    const pos = new THREE.Vector3();
    this.camera.getWorldPosition(pos);
    return pos;
  }

  // Get camera direction for raycasting
  getWorldDirection(): THREE.Vector3 {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return dir;
  }

  // Get the base frustum size at 1x zoom
  getBaseFrustumSize(): number {
    return this.baseFrustumSize;
  }

  // Get the frustum bounds at 1x zoom (unzoomed view)
  getFrustumBoundsAt1xZoom(aspect: number): { width: number; height: number; halfWidth: number; halfHeight: number } {
    // Calculate frustum size at 1x zoom (same logic as computeFrustumSize but with zoomFactor = 1.0)
    let baseSizeWithZoom = this.baseFrustumSize; // zoomFactor = 1.0

    if (aspect >= 1) {
      const height = baseSizeWithZoom;
      const width = baseSizeWithZoom * aspect;
      return {
        width,
        height,
        halfWidth: width / 2,
        halfHeight: height / 2,
      };
    }

    const towerWidth = (GRID.maxX - GRID.minX + 1) * BLOCK_RENDERING.geometrySize;
    const margin = CAMERA.portraitFitMargin;
    const targetWidth = towerWidth * (1 + margin * 2);
    const fitFrustumSize = targetWidth / Math.max(aspect, 0.0001);
    const height = Math.max(baseSizeWithZoom, fitFrustumSize);
    const width = height * aspect;
    return {
      width,
      height,
      halfWidth: width / 2,
      halfHeight: height / 2,
    };
  }

  // Get the camera's actual frustum bounds (accounting for current zoom)
  getCameraFrustumBounds(): { left: number; right: number; top: number; bottom: number } {
    return {
      left: this.camera.left,
      right: this.camera.right,
      top: this.camera.top,
      bottom: this.camera.bottom,
    };
  }
}
