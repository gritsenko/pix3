/**
 * TestRotateBehavior - A simple behavior for testing the script system
 *
 * Rotates a node continuously based on a configurable speed parameter.
 */

import { BehaviorBase } from '@/core/ScriptComponent';
import type { PropertySchema } from '@/fw';
import { Node3D } from '@/nodes/Node3D';

export class TestRotateBehavior extends BehaviorBase {
  private rotationSpeed: number = 1.0; // radians per second

  constructor(id: string, type: string) {
    super(id, type);
    // Initialize with default parameters
    this.parameters = {
      rotationSpeed: this.rotationSpeed,
    };
  }

  static getPropertySchema(): PropertySchema {
    return {
      nodeType: 'TestRotateBehavior',
      properties: [
        {
          name: 'rotationSpeed',
          type: 'number',
          ui: {
            label: 'Rotation Speed',
            description: 'Speed of rotation in radians per second',
            group: 'Behavior',
            min: 0,
            max: 10,
            step: 0.1,
          },
          getValue: (behavior: unknown) =>
            (behavior as TestRotateBehavior).parameters.rotationSpeed,
          setValue: (behavior: unknown, value: unknown) => {
            const b = behavior as TestRotateBehavior;
            b.parameters.rotationSpeed = Number(value);
            b.rotationSpeed = Number(value);
          },
        },
      ],
      groups: {
        Behavior: {
          label: 'Behavior Parameters',
          description: 'Configuration for rotation behavior',
          expanded: true,
        },
      },
    };
  }

  onAttach(): void {
    console.log(
      `[TestRotateBehavior] Attached to node "${this.node?.name}" (${this.node?.nodeId})`
    );
    // Read parameters from storage
    if (this.parameters.rotationSpeed !== undefined) {
      this.rotationSpeed = Number(this.parameters.rotationSpeed);
    }
  }

  onStart(): void {
    console.log(`[TestRotateBehavior] Starting on node "${this.node?.name}"`);
  }

  onUpdate(dt: number): void {
    if (!this.node || !(this.node instanceof Node3D)) {
      return;
    }

    // Rotate the node around Y axis
    this.node.rotation.y += this.rotationSpeed * dt;
  }

  onDetach(): void {
    console.log(`[TestRotateBehavior] Detached from node "${this.node?.name}"`);
  }
}
