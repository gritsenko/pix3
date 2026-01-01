/**
 * Example User Script: RotatingCube
 * 
 * This is a sample controller script that demonstrates how to write
 * custom game logic in Pix3. Place this file in your project's scripts/
 * directory to use it.
 * 
 * Usage:
 * 1. Save this file to scripts/RotatingCube.ts
 * 2. Open your project in Pix3
 * 3. Select a 3D node in the scene
 * 4. In the Inspector, add this controller to the node
 * 5. Enter Play Mode to see the rotation in action
 */

import { ScriptControllerBase } from '@pix3/engine';

export class RotatingCube extends ScriptControllerBase {
  /**
   * Define editable properties for this controller.
   * These will appear in the Inspector panel.
   */
  static getPropertySchema() {
    return {
      nodeType: 'RotatingCube',
      properties: [
        {
          name: 'rotationSpeed',
          type: 'number',
          getValue: (obj: any) => obj.parameters.rotationSpeed ?? 1.0,
          setValue: (obj: any, value: any) => {
            obj.parameters.rotationSpeed = value;
          },
          uiHints: {
            label: 'Rotation Speed',
            group: 'Animation',
            min: 0,
            max: 10,
            step: 0.1,
            unit: 'rad/s',
          },
        },
        {
          name: 'axis',
          type: 'select',
          getValue: (obj: any) => obj.parameters.axis ?? 'y',
          setValue: (obj: any, value: any) => {
            obj.parameters.axis = value;
          },
          uiHints: {
            label: 'Rotation Axis',
            group: 'Animation',
            options: [
              { value: 'x', label: 'X Axis' },
              { value: 'y', label: 'Y Axis' },
              { value: 'z', label: 'Z Axis' },
            ],
          },
        },
      ],
      groups: {
        Animation: { label: 'Animation', order: 0 },
      },
    };
  }

  /**
   * Called when the controller is first attached to a node
   */
  onAttach(node: any): void {
    console.log(`RotatingCube attached to node: ${node.name}`);
  }

  /**
   * Called once before the first update
   */
  onStart(): void {
    const speed = this.parameters.rotationSpeed ?? 1.0;
    const axis = this.parameters.axis ?? 'y';
    console.log(`RotatingCube started - Speed: ${speed}, Axis: ${axis}`);
  }

  /**
   * Called every frame during Play Mode
   * @param dt Delta time in seconds since last frame
   */
  onUpdate(dt: number): void {
    if (!this.node) return;

    const speed = (this.parameters.rotationSpeed as number) ?? 1.0;
    const axis = (this.parameters.axis as string) ?? 'y';

    // Rotate the node based on selected axis
    switch (axis) {
      case 'x':
        this.node.rotation.x += speed * dt;
        break;
      case 'y':
        this.node.rotation.y += speed * dt;
        break;
      case 'z':
        this.node.rotation.z += speed * dt;
        break;
    }
  }

  /**
   * Called when the controller is detached from the node
   */
  onDetach(): void {
    console.log('RotatingCube detached');
  }
}
