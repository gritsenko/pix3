import { Script } from '@pix3/runtime';
import type { PropertySchema } from '@pix3/runtime';
import { Game } from './core/Game';

/**
 * DeepCoreRunner — ECS bridge between the pix3 editor/runtime and the DeepCore game.
 *
 * Attach this component to a Node3D in the scene. On play, it initialises the full
 * DeepCore game loop (physics, voxel world, systems) and drives it each frame via
 * onUpdate(dt). All Three.js objects created by DeepCore are added as children of
 * the host node, so they appear in the pix3 viewport.
 */
export class DeepCoreRunner extends Script {
  private game: Game | null = null;
  private ready = false;

  constructor(id: string, type: string) {
    super(id, type);
    this.config = {};
  }

  static getPropertySchema(): PropertySchema {
    return {
      nodeType: 'DeepCoreRunner',
      properties: [],
      groups: {
        DeepCore: {
          label: 'DeepCore Runner',
          description: 'Bridges the DeepCore ECS game loop into the pix3 scene graph.',
          expanded: true,
        },
      },
    };
  }

  onStart(): void {
    if (!this.node) {
      console.error('[DeepCoreRunner] No node attached');
      return;
    }

    console.log('[DeepCoreRunner] Starting game on node:', this.node.name);

    // Create Game in embedded mode — the pix3 node acts as the scene root
    this.game = new Game({
      renderer: { externalParent: this.node, shadowsEnabled: true },
    });

    // init() is async (physics WASM, atlas loading) — run it and mark ready when done
    void this.game
      .init()
      .then(() => {
        this.ready = true;
        console.log('[DeepCoreRunner] Game initialised successfully');
      })
      .catch((err) => {
        console.error('[DeepCoreRunner] Game init failed:', err);
      });
  }

  onUpdate(dt: number): void {
    if (!this.ready || !this.game) return;
    this.game.update(dt);
  }

  onDetach(): void {
    if (this.game) {
      this.game.dispose();
      this.game = null;
    }
    this.ready = false;
    console.log('[DeepCoreRunner] Disposed');
  }
}
