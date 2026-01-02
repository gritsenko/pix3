/**
 * DemoGlbController - Auto-generated script
 *
 * Controller for node logic
 */

import { ScriptControllerBase } from '@/core/ScriptComponent';
import type { PropertySchema } from '@/fw';

export class DemoGlbController extends ScriptControllerBase {
  constructor(id: string, type: string) {
    super(id, type);
    // Initialize default parameters
    this.parameters = {
      // Add your parameters here
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
        //     group: 'Controller',
        //     min: 0,
        //     max: 10,
        //     step: 0.1,
        //   },
        //   getValue: (script: unknown) => (script as DemoGlbController).parameters.speed,
        //   setValue: (script: unknown, value: unknown) => {
        //     (script as DemoGlbController).parameters.speed = Number(value);
        //   },
        // },
      ],
      groups: {
        Controller: {
          label: 'Controller Parameters',
          description: 'Configuration for demoglb controller',
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
