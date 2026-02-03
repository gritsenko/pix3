import { Node2D, type Node2DProps } from '../Node2D';
import type { PropertySchema } from '../../fw/property-schema';
import { Group2D } from './Group2D';

export interface Layout2DProps extends Omit<Node2DProps, 'type'> {
  width?: number;
  height?: number;
  resolutionPreset?: ResolutionPreset;
  showViewportOutline?: boolean;
}

export enum ResolutionPreset {
  Custom = 'custom',
  FullHD = '1920x1080',
  HD = '1280x720',
  MobilePortrait = '1080x1920',
  Tablet = '1024x768',
}

export const RESOLUTION_PRESETS: Record<
  ResolutionPreset,
  { width: number; height: number; label: string }
> = {
  [ResolutionPreset.Custom]: { width: 1920, height: 1080, label: 'Custom' },
  [ResolutionPreset.FullHD]: { width: 1920, height: 1080, label: '1920x1080 (Full HD)' },
  [ResolutionPreset.HD]: { width: 1280, height: 720, label: '1280x720 (HD)' },
  [ResolutionPreset.MobilePortrait]: {
    width: 1080,
    height: 1920,
    label: '1080x1920 (Mobile Portrait)',
  },
  [ResolutionPreset.Tablet]: { width: 1024, height: 768, label: '1024x768 (Tablet)' },
};

export class Layout2D extends Node2D {
  private _width: number;
  private _height: number;
  private _resolutionPreset: ResolutionPreset;
  private _showViewportOutline: boolean;

  constructor(props: Layout2DProps) {
    super(props, 'Layout2D');

    this._width = props.width ?? 1920;
    this._height = props.height ?? 1080;
    this._resolutionPreset = props.resolutionPreset ?? ResolutionPreset.FullHD;
    this._showViewportOutline = props.showViewportOutline ?? true;

    this.isContainer = true;
  }

  get width(): number {
    return this._width;
  }

  set width(value: number) {
    if (this._width !== value) {
      this._width = value;
      this._resolutionPreset = ResolutionPreset.Custom;
      this.recalculateChildLayouts();
    }
  }

  get height(): number {
    return this._height;
  }

  set height(value: number) {
    if (this._height !== value) {
      this._height = value;
      this._resolutionPreset = ResolutionPreset.Custom;
      this.recalculateChildLayouts();
    }
  }

  get resolutionPreset(): ResolutionPreset {
    return this._resolutionPreset;
  }

  set resolutionPreset(value: ResolutionPreset) {
    if (this._resolutionPreset !== value) {
      this._resolutionPreset = value;
      const preset = RESOLUTION_PRESETS[value];
      if (preset && value !== ResolutionPreset.Custom) {
        this._width = preset.width;
        this._height = preset.height;
      }
      this.recalculateChildLayouts();
    }
  }

  get showViewportOutline(): boolean {
    return this._showViewportOutline;
  }

  set showViewportOutline(value: boolean) {
    this._showViewportOutline = value;
  }

  setSize(width: number, height: number): void {
    this._width = width;
    this._height = height;
    this._resolutionPreset = ResolutionPreset.Custom;
  }

  updateLayout(width?: number, height?: number): void {
    if (width !== undefined) this._width = width;
    if (height !== undefined) this._height = height;
    this.recalculateChildLayouts();
  }

  recalculateChildLayouts(): void {
    for (const child of this.children) {
      if (child instanceof Group2D) {
        child.updateLayout(this._width, this._height);
      }
    }
  }

  static getPropertySchema(): PropertySchema {
    const baseSchema = Node2D.getPropertySchema();

    return {
      nodeType: 'Layout2D',
      extends: 'Node2D',
      properties: [
        ...baseSchema.properties,
        {
          name: 'resolutionPreset',
          type: 'select',
          ui: {
            label: 'Resolution Preset',
            description: 'Quick preset for common screen resolutions',
            group: 'Viewport',
            options: [
              ResolutionPreset.Custom,
              ResolutionPreset.FullHD,
              ResolutionPreset.HD,
              ResolutionPreset.MobilePortrait,
              ResolutionPreset.Tablet,
            ],
          },
          getValue: (node: unknown) => (node as Layout2D).resolutionPreset,
          setValue: (node: unknown, value: unknown) => {
            (node as Layout2D).resolutionPreset = value as ResolutionPreset;
          },
        },
        {
          name: 'width',
          type: 'number',
          ui: {
            label: 'Width',
            description: 'Game viewport width in pixels',
            group: 'Viewport',
            step: 1,
            precision: 0,
            min: 100,
            unit: 'px',
          },
          getValue: (node: unknown) => (node as Layout2D).width,
          setValue: (node: unknown, value: unknown) => {
            (node as Layout2D).width = Number(value);
          },
        },
        {
          name: 'height',
          type: 'number',
          ui: {
            label: 'Height',
            description: 'Game viewport height in pixels',
            group: 'Viewport',
            step: 1,
            precision: 0,
            min: 100,
            unit: 'px',
          },
          getValue: (node: unknown) => (node as Layout2D).height,
          setValue: (node: unknown, value: unknown) => {
            (node as Layout2D).height = Number(value);
          },
        },
        {
          name: 'showViewportOutline',
          type: 'boolean',
          ui: {
            label: 'Show Viewport Outline',
            description: 'Display dashed border around game viewport',
            group: 'Viewport',
          },
          getValue: (node: unknown) => (node as Layout2D).showViewportOutline,
          setValue: (node: unknown, value: unknown) => {
            (node as Layout2D).showViewportOutline = Boolean(value);
          },
        },
      ],
      groups: {
        ...baseSchema.groups,
        Viewport: {
          label: 'Viewport',
          description: 'Game viewport settings',
          expanded: true,
        },
      },
    };
  }
}
