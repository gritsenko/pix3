import { Mesh, Object3D, AnimationClip, AnimationMixer, AnimationAction } from 'three';
import { Node3D, type Node3DProps } from '../Node3D';
import type { PropertySchema } from '../../fw/property-schema';

export interface MeshInstanceProps extends Omit<Node3DProps, 'type'> {
  src?: string | null; // res:// or templ:// path to .glb/.gltf
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Optional clip name to auto-play on first runtime tick. Falls back to first available clip. */
  initialAnimation?: string | null;
}

export class MeshInstance extends Node3D {
  readonly src: string | null;
  castShadow: boolean;
  receiveShadow: boolean;
  animations: AnimationClip[] = [];
  mixer: AnimationMixer | null = null;
  currentAction: AnimationAction | null = null;
  /** The name of the animation clip currently selected for preview. Editor-only, not serialized. */
  activeAnimation: string | null = null;
  initialAnimation: string | null;
  private hasAttemptedInitialAnimation = false;

  constructor(props: MeshInstanceProps) {
    super(props, 'MeshInstance');
    this.src = props.src ?? null;
    this.castShadow = props.castShadow ?? true;
    this.receiveShadow = props.receiveShadow ?? true;
    this.initialAnimation = props.initialAnimation ?? null;

    // Apply shadow properties to self
    this.castShadow = this.castShadow;
    this.receiveShadow = this.receiveShadow;
  }

  /**
   * Play an animation by name.
   * @param name - The name of the animation clip to play
   */
  playAnimation(name: string): void {
    const clip = this.animations.find(a => a.name === name);
    if (!clip) {
      console.warn(`[MeshInstance] Animation '${name}' not found on node ${this.nodeId}`);
      return;
    }

    if (!this.mixer) {
      this.mixer = new AnimationMixer(this);
    }

    if (this.currentAction) {
      this.currentAction.stop();
    }

    this.currentAction = this.mixer.clipAction(clip);
    this.currentAction.reset().play();
    this.activeAnimation = name;
    this.hasAttemptedInitialAnimation = true;
  }

  /**
   * Tick method called every frame.
   * Updates the animation mixer if it exists.
   * @param dt - Delta time in seconds since last frame
   */
  override tick(dt: number): void {
    super.tick(dt);
    this.playInitialAnimationIfNeeded();
    if (this.mixer) {
      this.mixer.update(dt);
    }
  }

  private playInitialAnimationIfNeeded(): void {
    if (this.hasAttemptedInitialAnimation || this.currentAction) {
      this.hasAttemptedInitialAnimation = true;
      return;
    }

    if (this.animations.length === 0) {
      return;
    }

    const preferredClip = this.initialAnimation
      ? this.animations.find(clip => clip.name === this.initialAnimation)
      : null;
    if (this.initialAnimation && !preferredClip) {
      console.warn(
        `[MeshInstance] Initial animation '${this.initialAnimation}' not found on node ${this.nodeId}. Falling back to first clip.`
      );
    }

    const clipToPlay = preferredClip ?? this.animations[0];
    this.playAnimation(clipToPlay.name);
  }

  /**
   * Get the property schema for MeshInstance.
   * Extends Node3D schema with shadow rendering properties.
   */
  static getPropertySchema(): PropertySchema {
    const baseSchema = Node3D.getPropertySchema();

    return {
      nodeType: 'MeshInstance',
      extends: 'Node3D',
      properties: [
        ...baseSchema.properties,
        {
          name: 'initialAnimation',
          type: 'string',
          ui: {
            label: 'Initial Animation',
            description: 'Clip name to auto-play on scene start (uses first clip when empty)',
            group: 'Animation',
          },
          getValue: (node: unknown) => {
            const n = node as MeshInstance;
            return n.initialAnimation ?? '';
          },
          setValue: (node: unknown, value: unknown) => {
            const n = node as MeshInstance;
            const v = typeof value === 'string' ? value.trim() : '';
            n.initialAnimation = v.length > 0 ? v : null;
            n.hasAttemptedInitialAnimation = false;
          },
        },
        {
          name: 'castShadow',
          type: 'boolean',
          ui: {
            label: 'Cast Shadow',
            description: 'Whether this mesh casts shadows in the scene',
            group: 'Rendering',
          },
          getValue: (node: unknown) => {
            const n = node as MeshInstance;
            return n.castShadow;
          },
          setValue: (node: unknown, value: unknown) => {
            const n = node as MeshInstance;
            const v = !!value;
            n.castShadow = v;
            MeshInstance.applyShadowPropertiesToChildren(n, v, n.receiveShadow);
          },
        },
        {
          name: 'receiveShadow',
          type: 'boolean',
          ui: {
            label: 'Receive Shadow',
            description: 'Whether this mesh receives shadows from other objects',
            group: 'Rendering',
          },
          getValue: (node: unknown) => {
            const n = node as MeshInstance;
            return n.receiveShadow;
          },
          setValue: (node: unknown, value: unknown) => {
            const n = node as MeshInstance;
            const v = !!value;
            n.receiveShadow = v;
            MeshInstance.applyShadowPropertiesToChildren(n, n.castShadow, v);
          },
        },
      ],
      groups: {
        ...baseSchema.groups,
        Animation: {
          label: 'Animation',
          description: 'Animation playback properties',
          expanded: true,
        },
        Rendering: {
          label: 'Rendering',
          description: 'Shadow and rendering properties',
          expanded: true,
        },
      },
    };
  }

  /**
   * Recursively apply shadow properties to all children meshes.
   * This ensures shadows are applied to loaded GLB models and their sub-meshes.
   */
  private static applyShadowPropertiesToChildren(
    node: Object3D,
    castShadow: boolean,
    receiveShadow: boolean
  ): void {
    if (node instanceof Mesh) {
      node.castShadow = castShadow;
      node.receiveShadow = receiveShadow;
    }

    for (const child of node.children) {
      MeshInstance.applyShadowPropertiesToChildren(child, castShadow, receiveShadow);
    }
  }

  /**
   * Apply shadow properties after loading geometry.
   * Call this after adding children from a loaded GLB/GLTF model.
   */
  applyLoadedShadowProperties(): void {
    MeshInstance.applyShadowPropertiesToChildren(this, this.castShadow, this.receiveShadow);
  }
}
