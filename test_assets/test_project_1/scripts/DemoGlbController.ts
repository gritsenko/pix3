/**
 * DemoGlbController - Auto-generated script
 *
 * Component for node logic
 */

import { Script } from '@/core/ScriptComponent';
import type { PropertySchema } from '@/fw';

export class DemoGlbController extends Script {
  constructor(id: string, type: string) {
    super(id, type);
    // Initialize default config
    this.config = {
      // Add your config here
    };
  }

  static getPropertySchema(): PropertySchema {
    return {
      nodeType: 'DemoGlbController',
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
        //   getValue: (script: unknown) => (script as DemoGlbController).config.speed,
        //   setValue: (script: unknown, value: unknown) => {
        //     (script as DemoGlbController).config.speed = Number(value);
        //   },
        // },
      ],
      groups: {
        Component: {
          label: 'Component Parameters',
          description: 'Configuration for demoglb component',
          expanded: true,
        },
      },
    };
  }

  onAttach(): void {
    console.log(`[DemoGlbController] Attached to node "${this.node?.name}" (${this.node?.nodeId})`);
    // Initialize script when attached to a node
  }

  onStart(): void {
    console.log(`[DemoGlbController] Starting on node "${this.node?.name}"`);
    // Called on the first frame after attachment
  }

  onUpdate(dt: number): void {
    // Called every frame with delta time in seconds
    // Implement your update logic here
  }

  onDetach(): void {
    console.log(`[DemoGlbController] Detached from node "${this.node?.name}"`);
    // Clean up resources when detached
  }
}
