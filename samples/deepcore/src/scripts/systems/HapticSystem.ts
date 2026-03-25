import { haptic } from 'ios-haptics';

export class HapticSystem {
  /**
   * Single vibration (confirm) - used for tool hits
   */
  static toolHit(): void {
    try {
      haptic.confirm();
    } catch (e) {
      // Silently fail on unsupported platforms
    }
  }

  /**
   * Single vibration - used when switching tools
   */
  static toolSwitching(): void {
    try {
      haptic();
    } catch (e) {
      // Silently fail on unsupported platforms
    }
  }

  /**
   * Single vibration - used when collecting resources
   */
  static resourceCollection(): void {
    try {
      haptic();
    } catch (e) {
      // Silently fail on unsupported platforms
    }
  }

  /**
   * Double vibration (confirm) - used when falling block collides with floor
   */
  static blockLanding(): void {
    try {
      haptic.confirm();
    } catch (e) {
      // Silently fail on unsupported platforms
    }
  }

  /**
   * Triple vibration (error) - used for big camera shake
   */
  static bigShake(): void {
    try {
      haptic.error();
    } catch (e) {
      // Silently fail on unsupported platforms
    }
  }
}
