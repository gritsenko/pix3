import { Script } from '../core/ScriptComponent';
import { NodeBase } from '../nodes/NodeBase';
import type { PropertySchema } from '../fw/property-schema';

/**
 * SineBehavior - Custom behavior script for oscillating a node.
 * 
 * Demonstrates basic animation by modifying the node's position over time
 * according to a sine wave.
 */
export class SineBehavior extends Script {
  private elapsedTime: number = 0;
  private initialPositionX: number = 0;
  private initialPositionY: number = 0;
  private initialPositionZ: number = 0;

  constructor(id: string, type: string) {
    super(id, type);
    // Default configuration
    this.config = {
      amplitude: 1.0,
      frequency: 1.0,
      axis: 'y',
    };
  }

  static getPropertySchema(): PropertySchema {
    return {
      nodeType: 'SineBehavior',
      properties: [
        {
          name: 'amplitude',
          type: 'number',
          ui: {
            label: 'Amplitude',
            description: 'Maximum displacement from the center',
            group: 'Oscillation',
            min: 0,
            step: 0.1,
          },
          getValue: (component: unknown) => (component as SineBehavior).config.amplitude,
          setValue: (component: unknown, value: unknown) => {
            (component as SineBehavior).config.amplitude = Number(value);
          },
        },
        {
          name: 'frequency',
          type: 'number',
          ui: {
            label: 'Frequency (Hz)',
            description: 'Oscillations per second',
            group: 'Oscillation',
            min: 0,
            step: 0.1,
          },
          getValue: (component: unknown) => (component as SineBehavior).config.frequency,
          setValue: (component: unknown, value: unknown) => {
            (component as SineBehavior).config.frequency = Number(value);
          },
        },
        {
          name: 'axis',
          type: 'select',
          ui: {
            label: 'Axis',
            description: 'The axis to oscillate along',
            group: 'Oscillation',
            options: ['x', 'y', 'z'],
          },
          getValue: (component: unknown) => (component as SineBehavior).config.axis,
          setValue: (component: unknown, value: unknown) => {
            (component as SineBehavior).config.axis = value;
          },
        },
      ],
      groups: {
        Oscillation: {
          label: 'Oscillation Settings',
          expanded: true,
        },
      },
    };
  }

  onAttach(node: NodeBase): void {
    console.log(`[SineOscillator] Attached to node: ${node.name} (${node.nodeId})`);
  }

  onStart(): void {
    if (this.node) {
      this.initialPositionX = this.node.position.x;
      this.initialPositionY = this.node.position.y;
      this.initialPositionZ = this.node.position.z;
      console.log(`[SineOscillator] Initialized base position: (${this.initialPositionX}, ${this.initialPositionY}, ${this.initialPositionZ})`);
    }
  }

  onUpdate(dt: number): void {
    if (!this.node) return;

    this.elapsedTime += dt;
    
    const amplitude = (this.config.amplitude as number) ?? 1.0;
    const frequency = (this.config.frequency as number) ?? 1.0;
    const axis = (this.config.axis as string) ?? 'y';

    // Sine wave calculation: position = initial + sin(time * freq * 2PI) * amplitude
    const offset = Math.sin(this.elapsedTime * frequency * Math.PI * 2) * amplitude;

    // Reset position to initial state first (optional, but cleaner)
    this.node.position.set(this.initialPositionX, this.initialPositionY, this.initialPositionZ);

    // Apply offset to selected axis
    if (axis === 'x') {
      this.node.position.x += offset;
    } else if (axis === 'y') {
      this.node.position.y += offset;
    } else if (axis === 'z') {
      this.node.position.z += offset;
    }
  }

  onDetach(): void {
    console.log(`[SineOscillator] Detached from node: ${this.node?.name}`);
  }
}
