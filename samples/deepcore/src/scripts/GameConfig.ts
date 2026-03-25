import { Script } from '@pix3/runtime';
import type { PropertySchema, PropertyDefinition } from '@pix3/runtime';
import { physicsConfig } from './config/physics';
import { gameplayConfig } from './config/gameplay';
import { toolsConfig } from './config/tools';

/**
 * GameConfig — Exposes DeepCore tuning parameters to the pix3 Inspector.
 *
 * Attach this component to any node in the scene (typically the same node as
 * DeepCoreRunner). Changing values in the Inspector immediately mutates the
 * live config objects used by the game systems.
 */
export class GameConfig extends Script {
  constructor(id: string, type: string) {
    super(id, type);
    this.config = {};
  }

  // --- Helpers for typed config access ---
  private static physics() { return physicsConfig; }
  private static gameplay() { return gameplayConfig; }
  private static tools() { return toolsConfig; }

  static getPropertySchema(): PropertySchema {
    const props: PropertyDefinition[] = [
      // ── Physics ──
      {
        name: 'gravity',
        type: 'number',
        ui: { label: 'Gravity', group: 'Physics', step: 1, unit: 'm/s²' },
        getValue: () => GameConfig.physics().physics.gravity,
        setValue: (_c: unknown, v: unknown) => { GameConfig.physics().physics.gravity = Number(v); },
      },
      {
        name: 'minImpactVelocity',
        type: 'number',
        ui: { label: 'Min Impact Velocity', group: 'Physics', step: 0.5 },
        getValue: () => GameConfig.physics().physics.minImpactVelocity,
        setValue: (_c: unknown, v: unknown) => { GameConfig.physics().physics.minImpactVelocity = Number(v); },
      },

      // ── Grid ──
      {
        name: 'gridWidth',
        type: 'number',
        ui: { label: 'Grid Width', group: 'Grid', step: 1, min: 1 },
        getValue: () => GameConfig.physics().grid.width,
        setValue: (_c: unknown, v: unknown) => { GameConfig.physics().grid.width = Number(v); },
      },
      {
        name: 'gridDepth',
        type: 'number',
        ui: { label: 'Grid Depth', group: 'Grid', step: 1, min: 1 },
        getValue: () => GameConfig.physics().grid.depth,
        setValue: (_c: unknown, v: unknown) => { GameConfig.physics().grid.depth = Number(v); },
      },
      {
        name: 'initialHeight',
        type: 'number',
        ui: { label: 'Initial Height', group: 'Grid', step: 1, min: 1 },
        getValue: () => GameConfig.physics().grid.initialHeight,
        setValue: (_c: unknown, v: unknown) => { GameConfig.physics().grid.initialHeight = Number(v); },
      },
      {
        name: 'chunkSize',
        type: 'number',
        ui: { label: 'Chunk Size', group: 'Grid', step: 1, min: 1 },
        getValue: () => GameConfig.physics().grid.chunkSize,
        setValue: (_c: unknown, v: unknown) => { GameConfig.physics().grid.chunkSize = Number(v); },
      },

      // ── Stability ──
      {
        name: 'stabilityCheckInterval',
        type: 'number',
        ui: { label: 'Check Interval', group: 'Stability', step: 0.05, unit: 's' },
        getValue: () => GameConfig.physics().stability.checkInterval,
        setValue: (_c: unknown, v: unknown) => { GameConfig.physics().stability.checkInterval = Number(v); },
      },
      {
        name: 'wobblePerDamage',
        type: 'number',
        ui: { label: 'Wobble per Damage', group: 'Stability', step: 0.1 },
        getValue: () => GameConfig.physics().stability.wobblePerDamage,
        setValue: (_c: unknown, v: unknown) => { GameConfig.physics().stability.wobblePerDamage = Number(v); },
      },
      {
        name: 'shockwaveReach',
        type: 'number',
        ui: { label: 'Shockwave Reach', group: 'Stability', step: 1, min: 0 },
        getValue: () => GameConfig.physics().stability.shockwaveReach,
        setValue: (_c: unknown, v: unknown) => { GameConfig.physics().stability.shockwaveReach = Number(v); },
      },

      // ── Tools — Pickaxe ──
      {
        name: 'pickaxeBaseDamage',
        type: 'number',
        ui: { label: 'Pickaxe Base Damage', group: 'Tools', step: 1, min: 0 },
        getValue: () => GameConfig.tools().toolProperties.pickaxe.baseDamage,
        setValue: (_c: unknown, v: unknown) => { GameConfig.tools().toolProperties.pickaxe.baseDamage = Number(v); },
      },
      {
        name: 'pickaxeFuelCost',
        type: 'number',
        ui: { label: 'Pickaxe Fuel Cost', group: 'Tools', step: 0.5, min: 0 },
        getValue: () => GameConfig.tools().toolProperties.pickaxe.fuelCost,
        setValue: (_c: unknown, v: unknown) => { GameConfig.tools().toolProperties.pickaxe.fuelCost = Number(v); },
      },

      // ── Tools — Drill ──
      {
        name: 'drillBaseDamage',
        type: 'number',
        ui: { label: 'Drill Base Damage', group: 'Tools', step: 1, min: 0 },
        getValue: () => GameConfig.tools().toolProperties.drill.baseDamage,
        setValue: (_c: unknown, v: unknown) => { GameConfig.tools().toolProperties.drill.baseDamage = Number(v); },
      },
      {
        name: 'drillTickRate',
        type: 'number',
        ui: { label: 'Drill Tick Rate', group: 'Tools', step: 10, min: 10, unit: 'ms' },
        getValue: () => GameConfig.tools().toolProperties.drill.tickRate,
        setValue: (_c: unknown, v: unknown) => { GameConfig.tools().toolProperties.drill.tickRate = Number(v); },
      },

      // ── Gameplay — Initial Resources ──
      {
        name: 'initialFuel',
        type: 'number',
        ui: { label: 'Initial Fuel', group: 'Gameplay', step: 10, min: 0 },
        getValue: () => GameConfig.gameplay().initialState.fuel,
        setValue: (_c: unknown, v: unknown) => { GameConfig.gameplay().initialState.fuel = Number(v); },
      },
      {
        name: 'maxFuel',
        type: 'number',
        ui: { label: 'Max Fuel', group: 'Gameplay', step: 10, min: 0 },
        getValue: () => GameConfig.gameplay().initialState.maxFuel,
        setValue: (_c: unknown, v: unknown) => { GameConfig.gameplay().initialState.maxFuel = Number(v); },
      },
      {
        name: 'toolDamageMultiplier',
        type: 'number',
        ui: { label: 'Tool Damage Multiplier', group: 'Gameplay', step: 0.1, min: 0.1 },
        getValue: () => GameConfig.gameplay().initialState.toolDamageMultiplier,
        setValue: (_c: unknown, v: unknown) => { GameConfig.gameplay().initialState.toolDamageMultiplier = Number(v); },
      },
    ];

    return {
      nodeType: 'GameConfig',
      properties: props,
      groups: {
        Physics: { label: 'Physics', expanded: true },
        Grid: { label: 'Grid Layout' },
        Stability: { label: 'Stability System' },
        Tools: { label: 'Tool Parameters', expanded: true },
        Gameplay: { label: 'Gameplay / Resources', expanded: true },
      },
    };
  }
}
