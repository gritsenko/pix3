import { Vector2 } from 'three';

import { Node2D, type Node2DProps } from '../Node2D';
import type { PropertySchema } from '../../fw/property-schema';

export interface Group2DProps extends Omit<Node2DProps, 'type'> {
  width?: number;
  height?: number;
  /** Anchor minimum point (0-1), default (0.5, 0.5) = center */
  anchorMin?: Vector2;
  /** Anchor maximum point (0-1), default (0.5, 0.5) = center */
  anchorMax?: Vector2;
  /** Offset from anchor min in pixels (left, bottom) */
  offsetMin?: Vector2;
  /** Offset from anchor max in pixels (right, top) */
  offsetMax?: Vector2;
}

/**
 * Layout anchor preset identifiers.
 * Used by inspector UI to quickly set common anchor configurations.
 */
export type LayoutPreset =
  | 'center'
  | 'stretch'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'
  | 'stretch-horizontal'
  | 'stretch-vertical';

/**
 * Layout preset definitions with anchor values and labels.
 */
export const LAYOUT_PRESETS: Record<
  LayoutPreset,
  { anchorMin: Vector2; anchorMax: Vector2; label: string }
> = {
  center: { anchorMin: new Vector2(0.5, 0.5), anchorMax: new Vector2(0.5, 0.5), label: 'Center' },
  stretch: { anchorMin: new Vector2(0, 0), anchorMax: new Vector2(1, 1), label: 'Stretch' },
  'top-left': { anchorMin: new Vector2(0, 1), anchorMax: new Vector2(0, 1), label: 'Top Left' },
  'top-center': {
    anchorMin: new Vector2(0.5, 1),
    anchorMax: new Vector2(0.5, 1),
    label: 'Top Center',
  },
  'top-right': { anchorMin: new Vector2(1, 1), anchorMax: new Vector2(1, 1), label: 'Top Right' },
  'middle-left': {
    anchorMin: new Vector2(0, 0.5),
    anchorMax: new Vector2(0, 0.5),
    label: 'Middle Left',
  },
  'middle-right': {
    anchorMin: new Vector2(1, 0.5),
    anchorMax: new Vector2(1, 0.5),
    label: 'Middle Right',
  },
  'bottom-left': {
    anchorMin: new Vector2(0, 0),
    anchorMax: new Vector2(0, 0),
    label: 'Bottom Left',
  },
  'bottom-center': {
    anchorMin: new Vector2(0.5, 0),
    anchorMax: new Vector2(0.5, 0),
    label: 'Bottom Center',
  },
  'bottom-right': {
    anchorMin: new Vector2(1, 0),
    anchorMax: new Vector2(1, 0),
    label: 'Bottom Right',
  },
  'stretch-horizontal': {
    anchorMin: new Vector2(0, 0.5),
    anchorMax: new Vector2(1, 0.5),
    label: 'Stretch H',
  },
  'stretch-vertical': {
    anchorMin: new Vector2(0.5, 0),
    anchorMax: new Vector2(0.5, 1),
    label: 'Stretch V',
  },
};

/**
 * Group2D is a container node with a defined size (width, height).
 * It allows positioning nested elements aligned to its edges.
 * Displayed as a rectangle in the editor.
 *
 * **Layout System (Anchor-based):**
 * - `anchorMin`/`anchorMax`: Normalized (0-1) anchor points relative to parent.
 *   When both are equal, the node has fixed size positioned at that anchor.
 *   When different, the node stretches between anchor points.
 * - `offsetMin`/`offsetMax`: Pixel offsets from anchor positions.
 *   offsetMin = (left, bottom), offsetMax = (right, top) in parent-relative coords.
 *
 * Coordinate system: Three.js 2D with center at (0,0).
 */
export class Group2D extends Node2D {
  // --- Private backing fields ---
  private _width: number;
  private _height: number;
  private _anchorMin: Vector2;
  private _anchorMax: Vector2;
  private _offsetMin: Vector2;
  private _offsetMax: Vector2;

  /** Cached parent dimensions for layout recalculation */
  private _parentWidth = 0;
  private _parentHeight = 0;

  /** Flag to prevent recursive layout updates */
  private _isUpdatingLayout = false;

  constructor(props: Group2DProps) {
    super(props, 'Group2D');

    const initialWidth = props.width ?? 100;
    const initialHeight = props.height ?? 100;

    this._width = initialWidth;
    this._height = initialHeight;

    // Default anchors to center (0.5, 0.5)
    this._anchorMin = props.anchorMin?.clone() ?? new Vector2(0.5, 0.5);
    this._anchorMax = props.anchorMax?.clone() ?? new Vector2(0.5, 0.5);

    // Default offsets: position node at center with initial size
    // For center anchor, offsetMin/Max define half-size extents
    this._offsetMin =
      props.offsetMin?.clone() ?? new Vector2(-initialWidth / 2, -initialHeight / 2);
    this._offsetMax = props.offsetMax?.clone() ?? new Vector2(initialWidth / 2, initialHeight / 2);
  }

  // --- Width/Height with layout recalc ---

  get width(): number {
    return this._width;
  }

  set width(value: number) {
    if (this._width !== value) {
      this._width = value;
      // Recalculate offsets to maintain current position with new size
      this._recalcOffsetsFromSize();
    }
  }

  get height(): number {
    return this._height;
  }

  set height(value: number) {
    if (this._height !== value) {
      this._height = value;
      this._recalcOffsetsFromSize();
    }
  }

  // --- Anchor Min ---

  get anchorMin(): Vector2 {
    return this._anchorMin;
  }

  set anchorMin(value: Vector2) {
    this._anchorMin.copy(value);
    this._clampAnchor(this._anchorMin);
    this._triggerLayoutUpdate();
  }

  // --- Anchor Max ---

  get anchorMax(): Vector2 {
    return this._anchorMax;
  }

  set anchorMax(value: Vector2) {
    this._anchorMax.copy(value);
    this._clampAnchor(this._anchorMax);
    this._triggerLayoutUpdate();
  }

  // --- Offset Min ---

  get offsetMin(): Vector2 {
    return this._offsetMin;
  }

  set offsetMin(value: Vector2) {
    this._offsetMin.copy(value);
    this._triggerLayoutUpdate();
  }

  // --- Offset Max ---

  get offsetMax(): Vector2 {
    return this._offsetMax;
  }

  set offsetMax(value: Vector2) {
    this._offsetMax.copy(value);
    this._triggerLayoutUpdate();
  }

  /**
   * Returns the size of the group as a Vector2.
   */
  getSize(): Vector2 {
    return new Vector2(this._width, this._height);
  }

  /**
   * Updates the size of the group.
   */
  setSize(width: number, height: number): void {
    this._width = width;
    this._height = height;
  }

  /**
   * Apply a layout preset to this node.
   * Presets set anchors and calculate offsets to maintain current size.
   */
  applyLayoutPreset(preset: LayoutPreset): void {
    const config = LAYOUT_PRESETS[preset];
    if (!config) return;

    // Store current center position and size
    const currentCenterX = this.position.x;
    const currentCenterY = this.position.y;
    const currentWidth = this._width;
    const currentHeight = this._height;

    // Set new anchors (don't trigger layout yet)
    this._anchorMin.copy(config.anchorMin);
    this._anchorMax.copy(config.anchorMax);

    // Calculate new offsets to maintain current visual position/size
    if (this._parentWidth > 0 && this._parentHeight > 0) {
      // Anchor positions in parent coordinates (center-origin)
      const anchorMinX = (this._anchorMin.x - 0.5) * this._parentWidth;
      const anchorMinY = (this._anchorMin.y - 0.5) * this._parentHeight;
      const anchorMaxX = (this._anchorMax.x - 0.5) * this._parentWidth;
      const anchorMaxY = (this._anchorMax.y - 0.5) * this._parentHeight;

      if (this._anchorMin.x === this._anchorMax.x && this._anchorMin.y === this._anchorMax.y) {
        // Fixed size: offsets are relative to single anchor point
        this._offsetMin.set(
          currentCenterX - currentWidth / 2 - anchorMinX,
          currentCenterY - currentHeight / 2 - anchorMinY
        );
        this._offsetMax.set(
          currentCenterX + currentWidth / 2 - anchorMaxX,
          currentCenterY + currentHeight / 2 - anchorMaxY
        );
      } else {
        // Stretch: calculate offsets from anchor edges
        const left = currentCenterX - currentWidth / 2;
        const right = currentCenterX + currentWidth / 2;
        const bottom = currentCenterY - currentHeight / 2;
        const top = currentCenterY + currentHeight / 2;

        this._offsetMin.set(left - anchorMinX, bottom - anchorMinY);
        this._offsetMax.set(right - anchorMaxX, top - anchorMaxY);
      }
    } else {
      // No parent dimensions yet, use default centered offsets
      this._offsetMin.set(-currentWidth / 2, -currentHeight / 2);
      this._offsetMax.set(currentWidth / 2, currentHeight / 2);
    }

    this._triggerLayoutUpdate();
  }

  /**
   * Recalculate offsets from current position and size.
   * Call this after manually changing position (e.g., via move transform)
   * to update offsets so the node stays at the new position.
   *
   * @param parentWidth Optional parent width override (use when parent dimensions aren't cached yet)
   * @param parentHeight Optional parent height override
   */
  recalculateOffsets(parentWidth?: number, parentHeight?: number): void {
    // Use provided dimensions, cached dimensions, or minimum fallback
    let pw = parentWidth ?? this._parentWidth;
    let ph = parentHeight ?? this._parentHeight;

    // If still zero, try to get from actual parent Group2D
    if (pw <= 0 || ph <= 0) {
      const parentGroup = this.parent instanceof Group2D ? this.parent : null;
      if (parentGroup) {
        pw = parentGroup.width || pw;
        ph = parentGroup.height || ph;
      }
    }

    // Warn and use minimum fallback if parent dimensions still invalid
    if (pw <= 0 || ph <= 0) {
      console.warn(
        `[Group2D] recalculateOffsets called with invalid parent dimensions: ${pw}x${ph}. Using 1x1 fallback.`
      );
      pw = Math.max(1, pw);
      ph = Math.max(1, ph);
    }

    // Cache valid parent dimensions
    this._parentWidth = pw;
    this._parentHeight = ph;

    // Get current visual bounds
    const currentCenterX = this.position.x;
    const currentCenterY = this.position.y;
    const currentWidth = this._width;
    const currentHeight = this._height;

    // Calculate anchor positions in parent coordinates (center-origin)
    const anchorMinX = (this._anchorMin.x - 0.5) * pw;
    const anchorMinY = (this._anchorMin.y - 0.5) * ph;
    const anchorMaxX = (this._anchorMax.x - 0.5) * pw;
    const anchorMaxY = (this._anchorMax.y - 0.5) * ph;

    // Calculate current edges
    const left = currentCenterX - currentWidth / 2;
    const right = currentCenterX + currentWidth / 2;
    const bottom = currentCenterY - currentHeight / 2;
    const top = currentCenterY + currentHeight / 2;

    // Calculate offsets from anchors to edges
    this._offsetMin.set(left - anchorMinX, bottom - anchorMinY);
    this._offsetMax.set(right - anchorMaxX, top - anchorMaxY);
  }

  /**
   * Update layout based on parent dimensions.
   * Calculates position and size from anchors and offsets.
   * Recursively updates Group2D children.
   *
   * @param parentWidth Parent container width in pixels
   * @param parentHeight Parent container height in pixels
   */
  updateLayout(parentWidth?: number, parentHeight?: number): void {
    if (this._isUpdatingLayout) return;
    this._isUpdatingLayout = true;

    try {
      // Use provided dimensions or cached values
      const pw = parentWidth ?? this._parentWidth;
      const ph = parentHeight ?? this._parentHeight;

      if (pw <= 0 || ph <= 0) {
        this._isUpdatingLayout = false;
        return;
      }

      // Cache parent dimensions for future updates
      this._parentWidth = pw;
      this._parentHeight = ph;

      // Calculate anchor positions in parent coordinates (center at 0,0)
      // anchorMin.x=0 → left edge = -pw/2, anchorMin.x=1 → right edge = pw/2
      const anchorMinX = (this._anchorMin.x - 0.5) * pw;
      const anchorMinY = (this._anchorMin.y - 0.5) * ph;
      const anchorMaxX = (this._anchorMax.x - 0.5) * pw;
      const anchorMaxY = (this._anchorMax.y - 0.5) * ph;

      // Apply offsets to get final edges
      const left = anchorMinX + this._offsetMin.x;
      const bottom = anchorMinY + this._offsetMin.y;
      const right = anchorMaxX + this._offsetMax.x;
      const top = anchorMaxY + this._offsetMax.y;

      // Calculate new size and position (minimum 1px to prevent zero-size issues)
      this._width = Math.max(1, right - left);
      this._height = Math.max(1, top - bottom);

      // Position is center of the rect
      this.position.x = (left + right) / 2;
      this.position.y = (top + bottom) / 2;

      // Recursively update children that are Group2D
      for (const child of this.children) {
        if (child instanceof Group2D) {
          child.updateLayout(this._width, this._height);
        }
      }
    } finally {
      this._isUpdatingLayout = false;
    }
  }

  /**
   * Clamp anchor values to 0-1 range.
   */
  private _clampAnchor(anchor: Vector2): void {
    anchor.x = Math.max(0, Math.min(1, anchor.x));
    anchor.y = Math.max(0, Math.min(1, anchor.y));
  }

  /**
   * Trigger layout update if parent dimensions are cached.
   */
  private _triggerLayoutUpdate(): void {
    if (this._parentWidth > 0 && this._parentHeight > 0) {
      this.updateLayout();
    }
  }

  /**
   * Recalculate offsets when size changes directly to maintain position.
   */
  private _recalcOffsetsFromSize(): void {
    if (this._parentWidth <= 0 || this._parentHeight <= 0) return;

    const centerX = this.position.x;
    const centerY = this.position.y;

    const anchorMinX = (this._anchorMin.x - 0.5) * this._parentWidth;
    const anchorMinY = (this._anchorMin.y - 0.5) * this._parentHeight;
    const anchorMaxX = (this._anchorMax.x - 0.5) * this._parentWidth;
    const anchorMaxY = (this._anchorMax.y - 0.5) * this._parentHeight;

    this._offsetMin.set(
      centerX - this._width / 2 - anchorMinX,
      centerY - this._height / 2 - anchorMinY
    );
    this._offsetMax.set(
      centerX + this._width / 2 - anchorMaxX,
      centerY + this._height / 2 - anchorMaxY
    );
  }

  /**
   * Get the property schema for Group2D.
   * Extends Node2D schema with group-specific size and layout properties.
   */
  static getPropertySchema(): PropertySchema {
    const baseSchema = Node2D.getPropertySchema();

    return {
      nodeType: 'Group2D',
      extends: 'Node2D',
      properties: [
        ...baseSchema.properties,
        // Size properties
        {
          name: 'width',
          type: 'number',
          ui: {
            label: 'Width',
            group: 'Size',
            step: 1,
            precision: 0,
            min: 0,
          },
          getValue: (node: unknown) => (node as Group2D).width,
          setValue: (node: unknown, value: unknown) => {
            (node as Group2D).width = Number(value);
          },
        },
        {
          name: 'height',
          type: 'number',
          ui: {
            label: 'Height',
            group: 'Size',
            step: 1,
            precision: 0,
            min: 0,
          },
          getValue: (node: unknown) => (node as Group2D).height,
          setValue: (node: unknown, value: unknown) => {
            (node as Group2D).height = Number(value);
          },
        },
        // Layout properties
        {
          name: 'anchorMin',
          type: 'vector2',
          ui: {
            label: 'Anchor Min',
            group: 'Layout',
            step: 0.01,
            precision: 2,
            min: 0,
            max: 1,
          },
          getValue: (node: unknown) => {
            const n = node as Group2D;
            return { x: n.anchorMin.x, y: n.anchorMin.y };
          },
          setValue: (node: unknown, value: unknown) => {
            const n = node as Group2D;
            const v = value as { x: number; y: number };
            n.anchorMin = new Vector2(v.x, v.y);
          },
        },
        {
          name: 'anchorMax',
          type: 'vector2',
          ui: {
            label: 'Anchor Max',
            group: 'Layout',
            step: 0.01,
            precision: 2,
            min: 0,
            max: 1,
          },
          getValue: (node: unknown) => {
            const n = node as Group2D;
            return { x: n.anchorMax.x, y: n.anchorMax.y };
          },
          setValue: (node: unknown, value: unknown) => {
            const n = node as Group2D;
            const v = value as { x: number; y: number };
            n.anchorMax = new Vector2(v.x, v.y);
          },
        },
        {
          name: 'offsetMin',
          type: 'vector2',
          ui: {
            label: 'Offset Min',
            group: 'Layout',
            step: 1,
            precision: 0,
          },
          getValue: (node: unknown) => {
            const n = node as Group2D;
            return { x: n.offsetMin.x, y: n.offsetMin.y };
          },
          setValue: (node: unknown, value: unknown) => {
            const n = node as Group2D;
            const v = value as { x: number; y: number };
            n.offsetMin = new Vector2(v.x, v.y);
          },
        },
        {
          name: 'offsetMax',
          type: 'vector2',
          ui: {
            label: 'Offset Max',
            group: 'Layout',
            step: 1,
            precision: 0,
          },
          getValue: (node: unknown) => {
            const n = node as Group2D;
            return { x: n.offsetMax.x, y: n.offsetMax.y };
          },
          setValue: (node: unknown, value: unknown) => {
            const n = node as Group2D;
            const v = value as { x: number; y: number };
            n.offsetMax = new Vector2(v.x, v.y);
          },
        },
      ],
      groups: {
        ...baseSchema.groups,
        Size: {
          label: 'Size',
          description: 'Group dimensions',
          expanded: true,
        },
        Layout: {
          label: 'Layout',
          description: 'Anchor-based layout settings',
          expanded: false,
        },
      },
    };
  }
}
