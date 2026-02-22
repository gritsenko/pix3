/**
 * RotateBehavior - A simple component for testing the script system
 *
 * Rotates a node continuously based on a configurable speed parameter.
 */

import { Script } from '../core/ScriptComponent';
import type { PropertySchema } from '../fw/property-schema';
import { Node3D } from '../nodes/Node3D';

export class RotateBehavior extends Script {
  private rotationSpeed: number = 1.0; // radians per second

  constructor(id: string, type: string) {
    super(id, type);
    // Initialize with default config
    this.config = {
      rotationSpeed: this.rotationSpeed,
    };
  }

  static getPropertySchema(): PropertySchema {
    return {
      nodeType: 'RotateBehavior',
      properties: [
        {
          name: 'rotationSpeed',
          type: 'number',
          ui: {
            label: 'Rotation Speed',
            description: 'Speed of rotation in radians per second',
            group: 'Component',
            min: 0,
            max: 10,
            step: 0.1,
          },
          getValue: (component: unknown) => (component as RotateBehavior).config.rotationSpeed,
          setValue: (component: unknown, value: unknown) => {
            const c = component as RotateBehavior;
            c.config.rotationSpeed = Number(value);
            c.rotationSpeed = Number(value);
          },
        },
      ],
      groups: {
        Component: {
          label: 'Component Parameters',
          description: 'Configuration for rotation component',
          expanded: true,
        },
      },
    };
  }

  onAttach(): void {
    console.log(
      `[RotateBehavior] Attached to node "${this.node?.name}" (${this.node?.nodeId})`
    );
    // Read config from storage
    if (this.config.rotationSpeed !== undefined) {
      this.rotationSpeed = Number(this.config.rotationSpeed);
    }
  }

  onStart(): void {
    console.log(`[RotateBehavior] Starting on node "${this.node?.name}"`);
  }

  onUpdate(dt: number): void {
    if (!this.node || !(this.node instanceof Node3D)) {
      return;
    }

    // Rotate the node around Y axis
    this.node.rotation.y += this.rotationSpeed * dt;
  }

  onDetach(): void {
    console.log(`[RotateBehavior] Detached from node "${this.node?.name}"`);
  }
}
