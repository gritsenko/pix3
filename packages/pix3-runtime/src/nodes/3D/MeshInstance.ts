import { Mesh, Object3D, AnimationClip, AnimationMixer, AnimationAction } from 'three';
import { Node3D, type Node3DProps } from '../Node3D';
import type { PropertySchema } from '../../fw/property-schema';

export interface MeshInstanceProps extends Omit<Node3DProps, 'type'> {
  src?: string | null; // res:// or templ:// path to .glb/.gltf
  castShadow?: boolean;
  receiveShadow?: boolean;
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

  constructor(props: MeshInstanceProps) {
    super(props, 'MeshInstance');
    this.src = props.src ?? null;
    this.castShadow = props.castShadow ?? true;
    this.receiveShadow = props.receiveShadow ?? true;

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
  }

  /**
   * Tick method called every frame.
   * Updates the animation mixer if it exists.
   * @param dt - Delta time in seconds since last frame
   */
  override tick(dt: number): void {
    super.tick(dt);
    if (this.mixer) {
      this.mixer.update(dt);
    }
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
