/**
 * BoxController - Auto-generated script component
 *
 * Custom script component for node logic
 */

import { Script, type PropertySchema } from '@pix3/engine';

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
    // Called every frame with delta time in seconds
    // Implement your update logic here
  }

  onDetach(): void {
    console.log(`[BoxController] Detached from node "${this.node?.name}"`);
    // Clean up resources when detached
  }
}
