import { Mesh, MeshBasicMaterial, PlaneGeometry, Texture } from 'three';
import { Node2D, type Node2DProps } from '../Node2D';
import type { PropertySchema } from '../../fw/property-schema';
import {
  findAnimationClip,
  type AnimationClip,
  type AnimationFrame,
  type AnimationResource,
} from '../../core/AnimationResource';

export interface AnimatedSprite2DProps extends Omit<Node2DProps, 'type'> {
  animationResourcePath?: string | null;
  currentClip?: string;
  isPlaying?: boolean;
  currentFrame?: number;
  width?: number;
  height?: number;
  color?: string;
}

export class AnimatedSprite2D extends Node2D {
  animationResourcePath: string | null;
  currentClip: string;
  isPlaying: boolean;
  width: number;
  height: number;
  color: string;

  private _currentFrame: number;
  private timeAccumulator = 0;
  private animationResource: AnimationResource | null = null;
  private activeClip: AnimationClip | null = null;
  private spritesheetTexture: Texture | null = null;

  private mesh: Mesh;
  private geometry: PlaneGeometry;
  private material: MeshBasicMaterial;

  constructor(props: AnimatedSprite2DProps) {
    super(props, 'AnimatedSprite2D');

    this.animationResourcePath =
      typeof props.animationResourcePath === 'string' && props.animationResourcePath.trim().length > 0
        ? props.animationResourcePath.trim()
        : null;
    this.currentClip = typeof props.currentClip === 'string' ? props.currentClip.trim() : '';
    this.isPlaying = props.isPlaying ?? true;
    this.width = props.width ?? 64;
    this.height = props.height ?? 64;
    this.color = props.color ?? '#ffffff';
    this._currentFrame = Math.max(0, Math.floor(props.currentFrame ?? 0));
    this.isContainer = false;

    if (this.animationResourcePath) {
      this.properties.animationResourcePath = this.animationResourcePath;
    }
    if (this.currentClip) {
      this.properties.currentClip = this.currentClip;
    }
    this.properties.isPlaying = this.isPlaying;
    this.properties.currentFrame = this._currentFrame;

    this.geometry = new PlaneGeometry(this.width, this.height);
    this.material = new MeshBasicMaterial({
      color: this.color,
      transparent: true,
      depthTest: false,
    });
    this.registerOpacityMaterial(this.material, 1);

    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.name = `${this.name}-Mesh`;
    this.add(this.mesh);
  }

  get currentFrame(): number {
    return this._currentFrame;
  }

  set currentFrame(value: number) {
    const normalized = Math.max(0, Math.floor(value));
    const frameCount = this.activeClip?.frames.length ?? 0;
    this._currentFrame = frameCount > 0 ? Math.min(normalized, frameCount - 1) : normalized;
    this.properties.currentFrame = this._currentFrame;
    this.refreshTexturePresentation();
  }

  setAnimationResource(resource: AnimationResource | null): void {
    this.animationResource = resource;
    this.syncActiveClip(false);
  }

  setSpritesheetTexture(texture: Texture | null): void {
    if (this.spritesheetTexture) {
      this.spritesheetTexture.dispose();
      this.spritesheetTexture = null;
    }

    if (texture) {
      const nextTexture = texture.clone();
      if ('colorSpace' in nextTexture) {
        (nextTexture as Texture & { colorSpace: string }).colorSpace = 'srgb';
      } else if ('encoding' in nextTexture) {
        (nextTexture as Texture & { encoding: number }).encoding = 3001;
      }
      this.spritesheetTexture = nextTexture;
    }

    this.refreshTexturePresentation();
  }

  tick(dt: number): void {
    super.tick(dt);

    const clip = this.activeClip;
    if (!this.isPlaying || !clip || clip.frames.length <= 1 || clip.fps <= 0) {
      return;
    }

    this.timeAccumulator += dt;
    const frameDuration = 1 / clip.fps;

    while (this.timeAccumulator >= frameDuration) {
      this.timeAccumulator -= frameDuration;

      let nextFrame = this._currentFrame + 1;
      if (nextFrame >= clip.frames.length) {
        if (clip.loop) {
          nextFrame = 0;
        } else {
          nextFrame = clip.frames.length - 1;
          this.isPlaying = false;
          this.properties.isPlaying = false;
        }
      }

      this.currentFrame = nextFrame;

      if (!this.isPlaying) {
        this.timeAccumulator = 0;
        break;
      }
    }
  }

  static getPropertySchema(): PropertySchema {
    const baseSchema = Node2D.getPropertySchema();
    return {
      ...baseSchema,
      nodeType: 'AnimatedSprite2D',
      properties: [
        ...baseSchema.properties,
        {
          name: 'width',
          type: 'number',
          ui: { label: 'Width', group: 'Size', min: 0, step: 1 },
          getValue: (node: unknown) => (node as AnimatedSprite2D).width,
          setValue: (node: unknown, value: unknown) => {
            const sprite = node as AnimatedSprite2D;
            sprite.width = Number(value);
            sprite.updateGeometry();
          },
        },
        {
          name: 'height',
          type: 'number',
          ui: { label: 'Height', group: 'Size', min: 0, step: 1 },
          getValue: (node: unknown) => (node as AnimatedSprite2D).height,
          setValue: (node: unknown, value: unknown) => {
            const sprite = node as AnimatedSprite2D;
            sprite.height = Number(value);
            sprite.updateGeometry();
          },
        },
        {
          name: 'color',
          type: 'color',
          ui: { label: 'Color', group: 'Style' },
          getValue: (node: unknown) => (node as AnimatedSprite2D).color,
          setValue: (node: unknown, value: unknown) => {
            const sprite = node as AnimatedSprite2D;
            sprite.color = String(value);
            sprite.refreshTexturePresentation();
          },
        },
        {
          name: 'animationResourcePath',
          type: 'string',
          ui: { label: 'Animation Asset', group: 'Animation', editor: 'animation-resource' },
          getValue: (node: unknown) => (node as AnimatedSprite2D).animationResourcePath ?? '',
          setValue: (node: unknown, value: unknown) => {
            const sprite = node as AnimatedSprite2D;
            const nextPath = String(value ?? '').trim();
            sprite.animationResourcePath = nextPath || null;
            if (sprite.animationResourcePath) {
              sprite.properties.animationResourcePath = sprite.animationResourcePath;
            } else {
              delete sprite.properties.animationResourcePath;
            }
          },
        },
        {
          name: 'currentClip',
          type: 'string',
          ui: { label: 'Clip', group: 'Animation' },
          getValue: (node: unknown) => (node as AnimatedSprite2D).currentClip,
          setValue: (node: unknown, value: unknown) => {
            const sprite = node as AnimatedSprite2D;
            sprite.currentClip = String(value ?? '').trim();
            if (sprite.currentClip) {
              sprite.properties.currentClip = sprite.currentClip;
            } else {
              delete sprite.properties.currentClip;
            }
            sprite.syncActiveClip(true);
          },
        },
        {
          name: 'isPlaying',
          type: 'boolean',
          ui: { label: 'Playing', group: 'Animation' },
          getValue: (node: unknown) => (node as AnimatedSprite2D).isPlaying,
          setValue: (node: unknown, value: unknown) => {
            const sprite = node as AnimatedSprite2D;
            sprite.isPlaying = Boolean(value);
            sprite.properties.isPlaying = sprite.isPlaying;
          },
        },
        {
          name: 'currentFrame',
          type: 'number',
          ui: { label: 'Current Frame', group: 'Animation', min: 0, step: 1 },
          getValue: (node: unknown) => (node as AnimatedSprite2D).currentFrame,
          setValue: (node: unknown, value: unknown) => {
            (node as AnimatedSprite2D).currentFrame = Number(value);
          },
        },
      ],
      groups: {
        ...baseSchema.groups,
        Size: { label: 'Size', expanded: true },
        Style: { label: 'Style', expanded: true },
        Animation: { label: 'Animation', expanded: true },
      },
    };
  }

  private getCurrentFrameData(): AnimationFrame | null {
    const frames = this.activeClip?.frames ?? [];
    if (frames.length === 0) {
      return null;
    }

    return frames[this._currentFrame] ?? null;
  }

  private refreshTexturePresentation(): void {
    const texture = this.spritesheetTexture;
    const currentFrame = this.getCurrentFrameData();

    if (texture) {
      if (this.material.map !== texture) {
        this.material.map = texture;
        this.material.needsUpdate = true;
      }

      if (currentFrame) {
        texture.offset.set(currentFrame.offset.x, currentFrame.offset.y);
        texture.repeat.set(currentFrame.repeat.x, currentFrame.repeat.y);
      } else {
        texture.offset.set(0, 0);
        texture.repeat.set(1, 1);
      }

      this.material.color.set('#ffffff');
    } else {
      if (this.material.map) {
        this.material.map = null;
        this.material.needsUpdate = true;
      }

      this.material.color.set(this.color);
    }
  }

  private syncActiveClip(resetFrame: boolean): void {
    const previousClipName = this.activeClip?.name ?? null;
    this.activeClip = findAnimationClip(this.animationResource, this.currentClip);

    const resolvedClipName = this.activeClip?.name ?? this.currentClip;
    if (resolvedClipName !== this.currentClip) {
      this.currentClip = resolvedClipName;
      if (resolvedClipName) {
        this.properties.currentClip = resolvedClipName;
      } else {
        delete this.properties.currentClip;
      }
    }

    if (resetFrame && previousClipName !== this.activeClip?.name) {
      this._currentFrame = 0;
      this.properties.currentFrame = this._currentFrame;
      this.timeAccumulator = 0;
    }

    const frameCount = this.activeClip?.frames.length ?? 0;
    if (frameCount > 0) {
      this._currentFrame = Math.max(0, Math.min(this._currentFrame, frameCount - 1));
      this.properties.currentFrame = this._currentFrame;
    } else {
      this._currentFrame = Math.max(0, this._currentFrame);
      this.properties.currentFrame = this._currentFrame;
      this.timeAccumulator = 0;
    }

    this.refreshTexturePresentation();
  }

  private updateGeometry(): void {
    this.geometry.dispose();
    this.geometry = new PlaneGeometry(this.width, this.height);
    this.mesh.geometry = this.geometry;
  }

  dispose(): void {
    this.geometry.dispose();
    if (this.spritesheetTexture) {
      this.spritesheetTexture.dispose();
      this.spritesheetTexture = null;
    }
    this.material.dispose();
  }
}
