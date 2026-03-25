/**
 * BoxController - Auto-generated script component
 *
 * Custom script component for node logic
 */

import { Script, type PropertySchema } from '@pix3/runtime';

export class BoxController extends Script {
  constructor(id: string, type: string) {
    super(id, type);
    // Initialize default config
    this.config = {
      // Add your config here
    };
  }

  static getPropertySchema(): PropertySchema {
    return {
      nodeType: 'BoxController',
      properties: [
        // Add property definitions here
        // Example:
        // {
        //   name: 'speed',
        //   type: 'number',
        //   ui: {
        //     label: 'Speed',
        //     description: 'Movement speed',
        //     group: 'Component',
        //     min: 0,
        //     max: 10,
        //     step: 0.1,
        //   },
        //   getValue: (script: unknown) => (script as BoxController).config.speed,
        //   setValue: (script: unknown, value: unknown) => {
        //     (script as BoxController).config.speed = Number(value);
        //   },
        // },
      ],
      groups: {
        Component: {
          label: 'Component Parameters',
          description: 'Configuration for boxcontroller component',
          expanded: true,
        },
      },
    };
  }

  onAttach(): void {
    console.log(`[BoxController] Attached to node "${this.node?.name}" (${this.node?.nodeId})`);
    // Initialize script when attached to a node
  }

  onStart(): void {
    console.log(`[BoxController] Starting on node "${this.node?.name}"`);
    // Called on the first frame after attachment
  }

  onUpdate(dt: number): void {
    if (!this.input || !this.node) return;

    const horizontal = this.input.getAxis('Horizontal');
    const vertical = this.input.getAxis('Vertical');

    if (horizontal !== 0 || vertical !== 0) {
      console.log(`[BoxController] Joystick input: ${horizontal.toFixed(2)}, ${vertical.toFixed(2)}`);

      const speed = 5;
      this.node.position.x += horizontal * speed * dt;
      this.node.position.z -= vertical * speed * dt; // Move in Z plane for 3D box
    }
  }

  onDetach(): void {
    console.log(`[BoxController] Detached from node "${this.node?.name}"`);
    // Clean up resources when detached
  }
}
